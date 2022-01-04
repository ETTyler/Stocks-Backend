const express = require('express')
const app = express()
const cors = require('cors')
const Pool = require('pg').Pool
const bcrypt = require('bcrypt')
const dotenv = require('dotenv').config()
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

app.use(cors())
app.use(express.json())

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

app.post('/api/users/login', async (request, response) => {
    pool.query('SELECT * FROM users WHERE email = $1', [request.body.email], (err, res) => {
      if (err) {
        console.log(err.stack)
      }
      if (res.rows[0]) {
        bcrypt.compare(request.body.password, res.rows[0].password, (err, result) => {
          if (result) {
            const userToken = {
              email: res.rows[0].email,
              id: res.rows[0].id, 
              name: res.rows[0].name
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
      else {
        response.send(false)
      }
    })
})

const PORT = 3001
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
