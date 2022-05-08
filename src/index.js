const express = require('express')
const app = express()
const path = require('path');
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
const { createChartData, formatDate } = require('./tools/tools')
const database = require('./stocks/internal/database')
const {stockPrice, historicalStockPrice, multipleStocks, historicalDataToNow, news} = require('./stocks/external/stocks')
const insights = require('./stocks/Controllers/insights')
const { calcDifferential } = require('./stocks/Controllers/differential')
const { stockHistory } = require('./stocks/Controllers/stockHistory')
const { getInvestment } = require('./stocks/Controllers/analyticsTools')
const { convertToPercentage, marketDataset } = require('./stocks/Controllers/analyticsGraph')
const { getPercentages, orderByPercentage } = require('./stocks/Controllers/analyticsStockInfo')
const { friendsPercentages } = require('./stocks/Controllers/friends')
const { getPercentagesFromDate } = require('./stocks/Controllers/friendsFromDate')

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
app.use(express.static('build'))

app.get('/portfolio', function(req, res) {
  res.sendFile(path.join(__dirname, '../build/index.html'), function(err) {
    if (err) {
      res.status(500).send(err)
    }
  })
})

app.get('/insights', function(req, res) {
  res.sendFile(path.join(__dirname, '../build/index.html'), function(err) {
    if (err) {
      res.status(500).send(err)
    }
  })
})

app.get('/analytics', function(req, res) {
  res.sendFile(path.join(__dirname, '../build/index.html'), function(err) {
    if (err) {
      res.status(500).send(err)
    }
  })
})

app.get('/login', function(req, res) {
  res.sendFile(path.join(__dirname, '../build/index.html'), function(err) {
    if (err) {
      res.status(500).send(err)
    }
  })
})


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
  response.send(stockInfo).status(200)
})

// Updates the current prices of all the stocks in the database the user owns
app.get('/api/stocks/update', auth, async (request, response) => {
  const userID = request.user.id
  const purchases = await database.purchases(userID)
  const tickers = purchases.map((purchase) => (
    purchase.ticker
  ))
  if (tickers.length === 0) {
    response.sendStatus(200)
  } 
  else {
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
  }
})

// Gets the historical data for all the stocks in the portfolio and returns the data combined into a single data set
app.get('/api/stocks/history', auth, async (request, response) => {
  const id = request.user.id
  const graphData = await stockHistory(id)
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

// News Article Route
app.get('/api/stocks/news', auth, async (request, response) => {
  const id = request.user.id
  const stocks = await database.stockPurchases(id)
  const tickers = stocks.map((purchase) => (
    purchase.ticker
  ))
  const newsArticle = await news(tickers)
  response.send(newsArticle)
})

// Differential Route
app.get('/api/stocks/differential', auth, async (request, response) => {
  const id = Number(request.user.id)
  const purchases = await database.purchases(id)
  const differential = await calcDifferential(purchases)
  response.send({
    differential: differential
  })
})

// Analytics Graph Route
app.get('/api/stocks/analytics/graph', auth, async (request, response) => {
  const id = Number(request.user.id)
  const userDataset = await stockHistory(id)
  const purchases = await database.purchases(id)
  const userInvestment = await getInvestment(purchases)
  const marketData = await marketDataset(purchases)
  const userPercentageDataset = convertToPercentage(userDataset, userInvestment)
  const marketPercentageDataset = convertToPercentage(marketData.dataset, marketData.initialPrice)
 
  response.send({
    userDataset: userPercentageDataset,
    marketDataset: marketPercentageDataset
  })
})

// Analytics Bottom bar route
app.get('/api/stocks/analytics/stockinfo', auth, async (request, response) => {
  const id = Number(request.user.id)
  const highestValue = await database.findPurchase(id, 'desc')
  const lowestValue = await database.findPurchase(id, 'asc')
  const highestStockData = await database.stockPurchaseByTicker(id, highestValue.ticker)
  const lowestStockData = await database.stockPurchaseByTicker(id, lowestValue.ticker)
  const percentages = await getPercentages(id)
  const largestGain = orderByPercentage(percentages, 'gain')
  const largestLoss = orderByPercentage(percentages, 'loss')

  response.send({
    highestStockData,
    lowestStockData,
    largestGain,
    largestLoss
  })
})

// Friends routes
app.get('/api/stocks/analytics/friends', auth, async (request, response) => {
  const id = Number(request.user.id)
  const friends = await friendsPercentages(id)
  friends.sort((firstItem, secondItem) => Number(secondItem.percent) - Number(firstItem.percent))
  response.send(friends)
})

app.get('/api/stocks/analytics/friends/:date', auth, async (request, response) => {
  const id = Number(request.user.id)
  const date = request.params.date
  const friends = await getPercentagesFromDate(id, date)
  friends.sort((firstItem, secondItem) => Number(secondItem.percent) - Number(firstItem.percent))
  response.send(friends)
})

const PORT = process.env.PORT
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
