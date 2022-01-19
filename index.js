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

const prisma = new PrismaClient()
app.use(cors())
app.use(express.json())

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
            pool.query(`UPDATE "Purchases" SET "Value" = ${stock.price}*"Shares" where "Ticker" = '${ticker}';`, async (err, res) => {
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


app.get('/api/stocks/info/:id', async (request, response) => {
  const id = request.params.id

  pool.query(`select * from "Purchases" inner join "Stocks" ON
    "Purchases"."Ticker"="Stocks"."Ticker" WHERE
    "Purchases"."UserID"=${id} ORDER BY "Value" desc;`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }    
    response.send(JSON.stringify(res.rows))
  })
})



const PORT = 3001
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
