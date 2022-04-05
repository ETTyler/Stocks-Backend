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

// Reusable Functions

const createChartData = (map, overallValue) => {
  let chartData = []
  for (const [key, value] of map.entries()) {
    const percentage = Number(value/overallValue*100).toFixed(2)
    chartData.push({
      name: key,
      y: Number(percentage)
    })
  }
  return chartData
}

const formatDate = (date) => {
  return date.toISOString().split('T')[0]
}


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
  axios
    .get(`https://api.stockdata.org/v1/data/quote?symbols=${ticker}&api_token=${process.env.STOCK_API_KEY}`)
    .catch(error => {
      console.log(error.toJSON());
      response.sendStatus(404)
    })
    .then(res => {
      response.send({
        price: res.data.data[0].price
      })
    })
})




// Sale/Purchase Routes

// Updates the database when a new sale is made
app.post('/api/sale/new', async (request, response) => {
  const { transactionID, saleDate, salePrice, sharesSold, value, shares, ticker, userID } = request.body
  const newShares = shares - sharesSold
  axios
    .get(`http://localhost:3001/api/stock/price/${ticker}`)
    .catch(error => {
      console.log(error.toJSON());
    })
    .then(res => {
      const newValue = Number(res.data.price)*Number(newShares)
      const result = prisma.sales.create({
        data: {
          userID: userID,
          salePrice: salePrice,
          saleDate: saleDate,
          sharesSold: sharesSold
        }
      })
      pool.query(`UPDATE "Purchases" 
      SET "value" = ${newValue}, "shares" = ${newShares} 
      WHERE "transactionID" = ${transactionID};`, async (err, res) => {
        if (err) {
          console.log(err.stack)
        }
        response.sendStatus(200)
      })
    })
})

// Updates the database when a new purchase is added
app.post('/api/purchases/new', async (request, response) => {
  const { userID, ticker, date, price, shares } = request.body
  const dateTime = new Date(date)
  axios
  .get(`http://localhost:3001/api/stock/price/${ticker}`)
  .catch(error => {
    console.log(error.toJSON());
  })
  .then(res => {
    const newValue = Number(res.data.price)*Number(shares)

    pool.query(`select * from "Purchases" WHERE
    "userID"=${userID};`, async (err, res) => {
      if (err) {
        console.log(err.stack)
      }    
      const tickers = res.rows.map((purchase) => (
        {
          ticker: purchase.ticker,
          shares: purchase.shares
        }
      ))
  
      tickers.forEach(stock => {
        if (ticker === stock.ticker) {
          // found out the maths to get the correct buying average
          pool.query(`UPDATE "Purchases" 
          SET "priceBought" = (${price}+"priceBought"/2), "value" = "value"+${newValue}, "shares" = "shares"+${shares} 
          WHERE "ticker" = '${ticker}' AND "userID" = ${userID};`, async (err, res) => {
            if (err) {
              console.log(err.stack)
            }
          })
          response.sendStatus(200)
        }
      })
      if(!(response.headersSent)) {
        const result = await prisma.purchases.create({
          data: {
            ticker: ticker,
            date: dateTime,
            priceBought: price,
            shares: Number(shares),
            userID: userID,
            value: Number(newValue)
          }
        })
        response.send(result)
      }
    })
  })
})


// Stocks Info Routes


// Gets all the stocks currently in the database
app.get('/api/stocks/info', async (request, response) => {
  pool.query(`SELECT * from "Stocks" ORDER BY "Name"`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
    const options = res.rows.sort().map((stock) => (
      {
        ticker: stock.Ticker,
        label: stock.Name
      }
    ))
    response.send(options.sort())
  })
})

// Gets all the stock data for a user
// TODO if the number of shares is 0 then do not return the stock
app.get('/api/stocks/info/:id', async (request, response) => {
  const id = request.params.id
  pool.query(`select * from "Purchases" inner join "Stocks" ON
    "Purchases"."ticker"="Stocks"."Ticker" WHERE
    "Purchases"."userID"=${id} ORDER BY "value" desc;`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }    
    response.send(res.rows)
  })
})

// Updates the current prices of all the stocks in the database the user owns
app.get('/api/stocks/update/:id', async (request, response) => {
  const userID = request.params.id
  let stockData
  pool.query(`SELECT * from "Purchases" where "userID"=${userID}`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
    const tickers = res.rows.map((purchase) => (
      purchase.ticker
    ))
    axios
    .get(`https://api.stockdata.org/v1/data/quote?symbols=${tickers.join()}&api_token=${process.env.STOCK_API_KEY}`)
    .catch(error => {
      console.log(error.toJSON());
    })
    .then(response => {
      stockData = response.data.data
      tickers.forEach(ticker => {
        stockData.forEach(stock => {
          if (ticker === stock.ticker) {
            pool.query(`UPDATE "Stocks" SET "Price" = ${stock.price} WHERE "Ticker" = '${ticker}';`, async (err, res) => {
              if (err) {
                console.log(err.stack)
              }
            })
            pool.query(`UPDATE "Purchases" SET "value" = ${stock.price}*"shares" where "ticker" = '${ticker}';`, async (err, res) => {
              if (err) {
                console.log(err.stack)
              }
            })
          }
        })
      })    
    })
    response.sendStatus(200)
  })
})

// Gets the historical data for all the stocks in the portfolio and returns the data combined into a single data set
app.get('/api/stocks/history/:id', async (request, response) => {
  const id = request.params.id
  let stockPrices = []
  pool.query(`SELECT * from "Purchases" where "userID"=${id}`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
    const tickers = res.rows.map((purchase) => (
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
      await axios
      .get(`https://api.stockdata.org/v1/data/eod?symbols=${obj.ticker}&date_from=${date}&date_to=${apiDate}&api_token=${process.env.STOCK_API_KEY}`)
      .catch(error => {
        console.log(error.toJSON());
      })
      .then(res => {
        const historicalPrices = res.data.data
        const stockPrice = historicalPrices.map(value =>
          [Date.parse(value.date),Number(value.close*obj.shares)]
        )
        stockPrices.push(stockPrice)
      })
    }
    const map = new Map()
    stockPrices.forEach(element => 
      element.forEach(el => {
        if (map.has(el[0])) {
          const existingValue = map.get(el[0])
          const newValue = Number(existingValue+el[1])
          map.set(el[0],newValue)
        }
        else {
          map.set(el[0],el[1]) 
        }
      })
    )
    const values = Array.from(map,([key,value]) => ([key,value]))
    const sortedValue = values.sort((a, b) => a[0] - b[0])
    response.send(sortedValue)
  })
})

// Gets the graph data for the individual stock chosen 
app.get('/api/stocks/graph/:chosenGraph/:id', async (request, response) => {
  const id = request.params.id
  const chosenGraph = request.params.chosenGraph
  pool.query(`select * from "Purchases" inner join "Stocks" ON
  "Purchases"."ticker"="Stocks"."Ticker" WHERE
  "Purchases"."userID"=${id} AND "Stocks"."Name"='${chosenGraph}'`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
    const stock = {
      ticker: res.rows[0].ticker,
      date: formatDate(res.rows[0].date),
      shares: res.rows[0].shares
    }
    axios
      .get(`https://api.stockdata.org/v1/data/eod?symbols=${stock.ticker}&date_from=${stock.date}&api_token=${process.env.STOCK_API_KEY}`)
      .catch(error => {
        console.log(error.toJSON());
      })
      .then(res => {
        const historicalPrices = res.data.data
        const stockPrices = historicalPrices.map(value =>
          [Date.parse(value.date),Number(value.close*stock.shares)]
        )
        response.send(stockPrices.sort())
      })
  })
})

// Gets the data for the 3 pie charts
app.get('/api/stocks/insights/:id', async (request, response) => {
  const id = request.params.id
  pool.query(`select * from "Purchases" inner join "Stocks" ON
    "Purchases"."ticker"="Stocks"."Ticker" WHERE
    "Purchases"."userID"=${id} ORDER BY "value" desc;`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
    let portfolioValue = 0
    const sectorMap = new Map()
    const typeMap = new Map()
    const positionMap = new Map()
    
    res.rows.forEach(purchase => {
      portfolioValue += Number(purchase.value)
      if (sectorMap.has(purchase.Sector)) {
        const existingValue = sectorMap.get(purchase.Sector)
        const newValue = Number(existingValue)+Number(purchase.value)
        sectorMap.set(purchase.Sector,newValue)
      }
      else {
       sectorMap.set(purchase.Sector,purchase.value) 
      }
      if (typeMap.has(purchase.Type)) {
        const existingValue = typeMap.get(purchase.Type)
        const newValue = Number(existingValue)+Number(purchase.value)
        typeMap.set(purchase.Type,newValue)
      }
      else {
       typeMap.set(purchase.Type,purchase.value) 
      }
      positionMap.set(purchase.Name,purchase.value) 
    })
    
    const sectorData = createChartData(sectorMap, portfolioValue)
    const typeData = createChartData(typeMap, portfolioValue)
    const positionData = createChartData(positionMap, portfolioValue)

    const responseData = [sectorData,typeData,positionData]
    response.send(responseData)
  })
})

// Gets news articles for analytics page
app.get('/api/stocks/news/:id', async (request, response) => {
  const id = request.params.id
  axios
    .get(`http://localhost:3001/api/stocks/info/${id}`)
    .catch(error => {
      console.log(error.toJSON())
    })
    .then(res => {
      const stocks = res.data.map((purchase) => (
        purchase.ticker
      ))
      axios
        .get(`https://api.stockdata.org/v1/news/all?symbols=${stocks.join()}&filter_entities=true&language=en&exclude_domains=gurufocus.com&api_token=${process.env.STOCK_API_KEY}`)
        .catch(error => {
          console.log(error.toJSON())
        })
        .then(res => {
          const newsArticle = {
            stock: res.data.data[0].entities[0].name,
            title: res.data.data[0].title,
            description: res.data.data[0].description,
            url: res.data.data[0].url
          }
          response.send(newsArticle)
        })
    })
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
  const currentRequest = axios.get(`http://localhost:3001/api/stock/price/VOO`)
  return axios.all([initialRequest, currentRequest])
    .catch(error => {
      console.log(error.toJSON())
    })
    .then(axios.spread((res1, res2) => {
      const percentageChange = (((Number(res2.data.price)-Number(res1.data.data[0].close))/Number(res2.data.price))*100).toFixed(2) 
      return percentageChange
    }))
}

app.get('/api/stocks/differential/:id', async (request, response) => {
  const id = Number(request.params.id)
  const percentageChange = await getPercentageChange(id)
  const marketChange = await marketPercentageChange(id)
  const differential = percentageChange-marketChange
  response.send({
    differential: differential
  })
})

const getDataset = async (id) => {
  return axios
  .get(`http://localhost:3001/api/stocks/history/${id}`)
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

app.get('/api/stocks/analytics/graph/:id', async (request, response) => {
  const id = Number(request.params.id)
  const userDataset = await getDataset(id)
  const userInvestment = await getInvestment(id)
  const userPercentageDataset = convertToPercentage(userDataset, userInvestment)
  const marketData = await marketDataset(id)
  const marketPercentageDataset = convertToPercentage(marketData.dataset, marketData.initialPrice)
  response.send({
    userDataset: userPercentageDataset,
    marketDataset: marketPercentageDataset
  })
})




const PORT = 3001
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
