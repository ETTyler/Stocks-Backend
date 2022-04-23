const express = require('express')
const app = express()
const cors = require('cors')
const Pool = require('pg').Pool
const bcrypt = require('bcrypt')
const dotenv = require('dotenv').config()
const axios = require('axios').default;
const rateLimit = require('express-rate-limit')
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: {
    rejectUnauthorized: false,
  },
})
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const auth = require('./users/auth')
const { createChartData, formatDate, createStockArray } = require('./tools/tools')
const database = require('./stocks/internal/database')
const {stockPrice, historicalStockPrice, multipleStocks, historicalData, historicalDataToNow, news} = require('./stocks/external/stocks')
const insights = require('./stocks/Controllers/insights')

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
})

const prisma = new PrismaClient()
app.use(cors())
app.use(express.json())
app.use(limiter)

const url = 'http://localhost:3001'

// Users routes

app.post('/api/users/login', async (request, response) => {
  const { email, password } = request.body
  try {
    const loginDetails = await prisma.users.findMany({
      where: { 
        email: email 
      }
    })
    const user = loginDetails[0]
    bcrypt.compare(password, user.password, (err, result) => {
      if (result) {
        const userToken = {
          email: user.email,
          id: user.id, 
          name: user.name
        }
        const token = jwt.sign(userToken, process.env.SECRET)
        response.send({
          status: true,
          token
        })
      }
      else {
        response.send(false)
      }
    }) 
  }
  catch (error) {
    console.log(error)
    response.send(false)
  }
})

// Stock Price route
app.get('/api/stock/price/:ticker', async (request, response) => {
  const ticker = request.params.ticker
  const price =  await stockPrice(ticker)
  if (price) {
    response.send({price: price})
  }
  else {
    response.sendStatus(404)
  }
})

// Sale/Purchase Routes

// Updates the database when a new sale is made
app.post('/api/sale/new', async (request, response) => {
  let { transactionID, saleDate, salePrice, sharesSold, shares, ticker, userID } = request.body
  const newShares = shares - sharesSold
  const currentPrice = await stockPrice(ticker)
    
  if (!salePrice) {
    salePrice = currentPrice
  }
  const newValue = Number(currentPrice)*Number(newShares)
  database.sale(userID, salePrice, saleDate, sharesSold, ticker)
  
  if (newShares === 0) {
    database.deletePurchase(transactionID)
    response.sendStatus(200)
  }
  else {
    database.updatePurchase(transactionID, newValue, newShares)
    response.sendStatus(200)
  }
})

// Updates the database when a new purchase is added
app.post('/api/purchases/new', async (request, response) => {
  let { userID, ticker, date, price, shares } = request.body
  const dateTime = new Date(date)
  const formattedDate = formatDate(dateTime)
  if (price === 'historical') {
    price = await historicalStockPrice(ticker, formattedDate)
  }
  else if (price === 'current') {
    price = await stockPrice(ticker)
  }
  const newValue = Number(price)*Number(shares)
  const purchases = await database.purchases(userID)
  const tickers = purchases.map((purchase) => (
    {
      ticker: purchase.ticker,
      shares: purchase.shares
    }
  ))
  tickers.forEach(stock => {
    if (ticker === stock.ticker) {
      database.changePurchase(price, newValue, shares, ticker, userID)
      // found out the maths to get the correct buying average
      response.sendStatus(200)
    }
  })
  if(!(response.headersSent)) {
    database.purchase(ticker, dateTime, price, shares, userID, newValue)
    response.sendStatus(200)
  }
})


// Stocks Info Routes


// Gets all the stocks currently in the database
app.get('/api/stocks/info', async (request, response) => {
  const stocks = await database.stocks()
  const options = stocks.sort().map((stock) => (
    {
      ticker: stock.Ticker,
      label: stock.Name
    }
  ))
  response.send(options.sort())
})

// Gets all the stock data for a user
app.get('/api/stocks/information', auth, async (request, response) => {
  const id = request.user.id
  const stockInfo = await database.stockPurchases(id)
  response.send(stockInfo)
})

// Updates the current prices of all the stocks in the database the user owns
app.get('/api/stocks/update', auth, async (request, response) => {
  const userID = request.user.id
  const purchases = await database.purchases(userID)
  const tickers = purchases.map((purchase) => (
    purchase.ticker
  ))
  const stockData = await multipleStocks(tickers)
  tickers.forEach(ticker => {
    stockData.forEach(stock => {
      if (ticker === stock.ticker) {
        database.updateStock(stock.price, ticker)
        database.updatePurchaseValue(stock.price, ticker)
      }
    })
  })
  response.sendStatus(200)
})

// Gets the historical data for all the stocks in the portfolio and returns the data combined into a single data set
app.get('/api/stocks/history', auth, async (request, response) => {
  const id = request.user.id
  let stockPrices = []
  const purchases = await database.purchases(id)
  const tickers = purchases.map((purchase) => (
    {
      ticker: purchase.ticker,
      date: purchase.date,
      shares: purchase.shares
    }
  ))
  for await (const obj of tickers) {
    const date = formatDate(obj.date)
    const currentDate = new Date()
    currentDate.setDate(currentDate.getDate()-2)
    const apiDate = formatDate(currentDate)
    
    const stockPrice = await historicalData(obj.ticker, date, apiDate, obj.shares)
    stockPrices.push(stockPrice)
  }
  const graphData = createStockArray(stockPrices)
  response.send(graphData)
})

// Gets the graph data for the individual stock chosen 
app.get('/api/stocks/graph/:chosenGraph', auth, async (request, response) => {
  const id = request.user.id
  const chosenGraph = request.params.chosenGraph

  const stockPurchase = await database.stockPurchase(id, chosenGraph)
  const stock = {
    ticker: stockPurchase[0].ticker,
    date: formatDate(stockPurchase[0].date),
    shares: stockPurchase[0].shares
  }
  const stockData = await historicalDataToNow(stock.ticker, stock.date, stock.shares)
  response.send(stockData.sort())
})

// Gets the data for the 3 pie charts
app.get('/api/stocks/insights', auth, async (request, response) => {
  const id = request.user.id
  const stockPurchases = await database.stockPurchases(id)
    
  const {sectorMap, typeMap, positionMap, portfolioValue} = insights(stockPurchases)
  const sectorData = createChartData(sectorMap, portfolioValue)
  const typeData = createChartData(typeMap, portfolioValue)
  const positionData = createChartData(positionMap, portfolioValue)

  const responseData = [sectorData,typeData,positionData]
  response.send(responseData)
})

// Gets news articles for analytics page
app.get('/api/stocks/news', auth, async (request, response) => {
  const id = request.user.id
  const stocks = await database.stockPurchases(id)
  const tickers = stocks.map((purchase) => (
    purchase.ticker
  ))
  const newsArticle = await news(tickers)
  response.send(newsArticle)
})

// functions to get the differential
const getPurchases = async (userID) => {
  try {
    const purchases = await prisma.purchases.findMany({
      orderBy: [
        {
          date: 'asc'
        }
      ],
      where: { 
        userID: userID 
      }
    })
    return purchases
  }
  catch (error) {
    console.log(error)
  }
}

const getInvestment = async (userID) => {
  const purchases = await getPurchases(userID)
  const investment = purchases.reduce((previous, current) => {
    return Number(previous) + Number(current.priceBought)*Number(current.shares)
  }, 0)
  return investment.toFixed(2)
}

const getCurrentValue = async (userID) => {
  const purchases = await getPurchases(userID)
  const currentValue = purchases.reduce((previous, current) => {
    return Number(previous) + Number(current.value)
  }, 0)
  return currentValue.toFixed(2)
}

const calcPercentage = (currentValue, originalValue) => {
  return (((currentValue-originalValue)/originalValue)*100).toFixed(2)
}

const getPercentageChange = async (userID) => {
  const investment = await getInvestment(userID)
  const currentValue = await getCurrentValue(userID)
  return calcPercentage(currentValue, investment)
}

const getInitialInvestmentDate = async (userID) => {
  const purchases = await getPurchases(userID)
  const date = purchases[0].date
  return date
}

const marketPercentageChange = async (userID) => {
  const initialDate = await getInitialInvestmentDate(userID)
  const formattedInitialDate = formatDate(initialDate)
  
  const initialRequest = axios.get(`https://api.stockdata.org/v1/data/eod?symbols=VOO&date=${formattedInitialDate}&api_token=${process.env.STOCK_API_KEY}`)
  const currentRequest = axios.get(`${url}/api/stock/price/VOO`)
  return axios.all([initialRequest, currentRequest])
    .catch(error => {
      console.log(error.toJSON())
    })
    .then(axios.spread((res1, res2) => {
      const percentageChange = (((Number(res2.data.price)-Number(res1.data.data[0].close))/Number(res2.data.price))*100).toFixed(2) 
      return percentageChange
    }))
}

app.get('/api/stocks/differential', auth, async (request, response) => {
  const id = Number(request.user.id)
  const percentageChange = await getPercentageChange(id)
  const marketChange = await marketPercentageChange(id)
  const differential = percentageChange-marketChange
  response.send({
    differential: differential
  })
})


// Functions for Analytics graph
const getDataset = async (token) => {
  const config = {
    headers: {
      Authorization: token
    }
  }
  return axios
  .get(`${url}/api/stocks/history`, config)
  .catch(error => {
    console.log(error.toJSON())
  })
  .then(res => {
    return res.data
  })
}

const convertToPercentage = (dataset, comparisonValue) => {
  const newDataset = dataset.map((element) => (
    [element[0], Number(calcPercentage(element[1], comparisonValue))]
  ))
  return (newDataset)
}

const marketDataset = async (id) => {
  const date = await getInitialInvestmentDate(id)
  const currentDate = new Date()
  currentDate.setDate(currentDate.getDate()-2)
  const apiDate = formatDate(currentDate)
  return axios
  .get(`https://api.stockdata.org/v1/data/eod?symbols=VOO&date_from=${formatDate(date)}&date_to=${apiDate}&api_token=${process.env.STOCK_API_KEY}`)
  .catch(error => {
    console.log(error.toJSON());
  })
  .then(res => {
    const historicalPrices = res.data.data
    const index = res.data.meta.returned
    const stockPrices = historicalPrices.map(value =>
      [Date.parse(value.date),Number(value.close)]
    )
    const marketData = {
      initialPrice: res.data.data[index-1].close,
      dataset: stockPrices.sort()
    }
    return marketData
  })
}

app.get('/api/stocks/analytics/graph', auth, async (request, response) => {
  const id = Number(request.user.id)
  const token = request.header('Authorization')
  const userDataset = await getDataset(token)
  const userInvestment = await getInvestment(id)
  const userPercentageDataset = convertToPercentage(userDataset, userInvestment)
  const marketData = await marketDataset(id)
  const marketPercentageDataset = convertToPercentage(marketData.dataset, marketData.initialPrice)
  response.send({
    userDataset: userPercentageDataset,
    marketDataset: marketPercentageDataset
  })
})

// Analytics Bottom bar functions and route
const orderByValue = async (userID, order) => {
  try {
    const purchases = await prisma.purchases.findFirst({
      orderBy: [
        {
          value: order
        }
      ],
      where: { 
        userID: userID 
      },
    })
    return purchases
  }
  catch (error) {
    console.log(error)
  }
}

const getPurchasesStocks = async (userID) => {
  try {
    const res = await pool.query(`select * from "Purchases" inner join "Stocks" ON
    "Purchases"."ticker"="Stocks"."Ticker" WHERE
    "Purchases"."userID"=${userID} ORDER BY "value";`)
    return res.rows
  } catch (err) {
    console.log(err.stack)
  }
}

const getIndividualStock = async (userID, ticker) => {
  try {
    const res = await pool.query(`select * from "Purchases" inner join "Stocks" ON
    "Purchases"."ticker"="Stocks"."Ticker" WHERE
    "Purchases"."userID"=${userID} AND "Purchases"."ticker"='${ticker}';`)
    return res.rows[0]
  } catch (err) {
    console.log(err.stack)
  }
}

const getPercentages = async (userID) => {
  const array = await getPurchasesStocks(userID)
  const newArr = array.map(purchase => {
    const percentage = Number(calcPercentage(Number(purchase.Price),Number(purchase.priceBought)))
    const obj = {ticker: purchase.Ticker, percentage, LogoURL: purchase.LogoURL, name: purchase.Name }
    return obj
  })
  return newArr
}

const orderPercentage = (arr, order) => {
  if (order === 'loss') {
    arr.sort((a,b) => {
      return(a.percentage - b.percentage)
    })
    return Object.values(arr)[0]
  }
  else {
    arr.sort((a,b) => {
      return(b.percentage - a.percentage)
    })
    return Object.values(arr)[0]
  }
}

app.get('/api/stocks/analytics/stockinfo', auth, async (request, response) => {
  const id = Number(request.user.id)
  const highestValue = await orderByValue(id, 'desc')
  const highestStockData = await getIndividualStock(id, highestValue.ticker)
  const lowestValue = await orderByValue(id, 'asc')
  const lowestStockData = await getIndividualStock(id, lowestValue.ticker)
  const percentages = await getPercentages(id)
  const largestGain = orderPercentage(percentages, 'gain')
  const largestLoss = orderPercentage(percentages, 'loss')
  response.send({
    highestStockData,
    lowestStockData,
    largestGain,
    largestLoss
  })
})

// Friends data functions and routes

const getFriends = async (userID) => {
  try {
    const friends = await prisma.friends.findMany({
      where: { 
        userID1: userID 
      },
    })
    return friends
  }
  catch (error) {
    console.log(error)
  }
}

const getUserInfo = async (userID) => {
  try {
    const user = await prisma.users.findUnique({
      where: { 
        id: userID 
      },
    })
    return user
  }
  catch (error) {
    console.log(error)
  }
}

const friendsPercentages = async (userID) => {
  const friends = await getFriends(userID)
  const percentages =  friends.map(async friend => {
    const userInfo = await getUserInfo(friend.userID2)
    const percent = await getPercentageChange(friend.userID2)
    return {name: userInfo.name, percent}
  })
  const resolved = await Promise.all(percentages)
  return resolved
}

app.get('/api/stocks/analytics/friends', auth, async (request, response) => {
  const id = Number(request.user.id)
  const friends = await friendsPercentages(id)
  friends.sort((firstItem, secondItem) => Number(secondItem.percent) - Number(firstItem.percent))
  response.send(friends)
})

const getPurchasesFromDate = async (userID, date) => {
  try {
    const res = await pool.query(`select * from "Purchases" WHERE
    "userID"=${userID} AND "date"<'${date}';`)
    return res.rows
  } catch (err) {
    console.log(err.stack)
  }
}

const getPercentagesFromDate = async (userID, date) => {
  const friends = await getFriends(userID)
  const percentages = friends.map(async friend => {
    const userInfo = await getUserInfo(friend.userID2)
    const currentValue = await getCurrentValue(friend.userID2)
    const purchases = await getPurchasesFromDate(friend.userID2, date)
    const tickers = purchases.map(purchase => (
      {
        ticker: purchase.ticker,
        shares: purchase.shares
      }
    ))
    let dateValue = 0
    for await (const obj of tickers) {
      await axios
      .get(`https://api.stockdata.org/v1/data/eod?symbols=${obj.ticker}&date=${date}&api_token=${process.env.STOCK_API_KEY}`)
      .catch(error => {
        console.log(error.toJSON());
      })
      .then(res => {
        const closePrice = Number(res.data.data[0].close)
        dateValue += (closePrice*Number(obj.shares))
      })
    }
    const percentageChange = calcPercentage(currentValue, dateValue)
    return {name: userInfo.name, percent: Number(percentageChange) }
  })
  const resolved = await Promise.all(percentages)
  return resolved
}

app.get('/api/stocks/analytics/friends/:date', auth, async (request, response) => {
  const id = Number(request.user.id)
  const date = request.params.date
  const friends = await getPercentagesFromDate(id, date)
  friends.sort((firstItem, secondItem) => Number(secondItem.percent) - Number(firstItem.percent))
  response.send(friends)
})


const PORT = 3001
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
