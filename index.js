const express = require('express')
const app = express()
const cors = require('cors')
const Pool = require('pg').Pool
const bcrypt = require('bcrypt')
const dotenv = require('dotenv').config()
const axios = require('axios').default;
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
const { rows } = require('pg/lib/defaults')

const prisma = new PrismaClient()
app.use(cors())
app.use(express.json())

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

app.post('/api/purchases/new', async (request, response) => {
  const { userID, ticker, date, price, shares } = request.body
  const value = price*shares
  const dateTime = new Date(date)

  pool.query(`select * from "Purchases" WHERE
  "userID"=${userID};`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }    
    const tickers = res.rows.map((purchase) => (
      purchase.ticker
    ))

    tickers.forEach(tick => {
      if (ticker === tick) {
        pool.query(`UPDATE "Purchases" 
        SET "priceBought" = (${price}+"priceBought"/2), "value" = "value"+${value}, "shares" = "shares"+${shares} 
        WHERE "ticker" = '${ticker}' AND "userID" = ${userID};`, async (err, res) => {
          if (err) {
            console.log(err.stack)
          }
        })
        response.send()
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
          value: Number(shares*price)
        }
      })
      response.send(result)
    }
  })
})

app.get('/api/stocks/info', async (request, response) => {
  pool.query(`SELECT * from "Stocks"`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
    const options = res.rows.map((stock) => (
      {
        ticker: stock.Ticker,
        label: stock.Name
      }
    ))
    response.send(options)
  })
})


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

app.get('/api/stocks/update', async (request, response) => {
  let stockData
  pool.query(`SELECT * from "Stocks"`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
    const tickers = res.rows.map((purchase) => (
      purchase.Ticker
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
  })
  response.send()
})

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
      const date = obj.date.toISOString().split('T')[0]
      await axios
      .get(`https://api.stockdata.org/v1/data/eod?symbols=${obj.ticker}&date_from=${date}&api_token=${process.env.STOCK_API_KEY}`)
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

app.get('/api/stocks/graph/:chosenGraph/:id', async (request, response) => {
  const id = request.params.id
  const chosenGraph = request.params.chosenGraph
  let stockPrices = []
  pool.query(`select * from "Purchases" inner join "Stocks" ON
  "Purchases"."ticker"="Stocks"."Ticker" WHERE
  "Purchases"."userID"=${id} AND "Stocks"."Name"='${chosenGraph}'`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
    const stock = {
      ticker: res.rows[0].ticker,
      date: res.rows[0].date,
      shares: res.rows[0].shares
    }
    const date = stock.date.toISOString().split('T')[0]
    axios
      .get(`https://api.stockdata.org/v1/data/eod?symbols=${stock.ticker}&date_from=${date}&api_token=${process.env.STOCK_API_KEY}`)
      .catch(error => {
        console.log(error.toJSON());
      })
      .then(res => {
        const historicalPrices = res.data.data
        const stockPrice = historicalPrices.map(value =>
          [Date.parse(value.date),Number(value.close*stock.shares)]
        )
        response.send(stockPrice)
      })
  })
})

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

const PORT = 3001
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
