const express = require('express')
const app = express()
const cors = require('cors')
const Pool = require('pg').Pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'stocks',
  password: 'ZonedOnline123',
  port: 5432,
})

app.use(cors())
app.use(express.json())

let users = [
  {
    id: 1,
    email: "ethan@example.com",
    password: "example",
  }
]

app.post('/api/users/login', (request, response) => {
    pool.query('SELECT * FROM users WHERE (email, password) = ($1, $2)', [request.body.email, request.body.password], (err, res) => {
      if (err) {
        console.log(err.stack)
      }
      if (res.rows[0]) {
        response.send(true)
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
