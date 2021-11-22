const express = require('express')
const app = express()
const cors = require('cors')
const Pool = require('pg').Pool
const bcrypt = require('bcrypt')
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'stocks',
  password: 'ZonedOnline123',
  port: 5432,
})

app.use(cors())
app.use(express.json())

app.post('/api/users/login', async (request, response) => {
    pool.query('SELECT * FROM users WHERE email = $1', [request.body.email], (err, res) => {
      if (err) {
        console.log(err.stack)
      }
      if (res.rows[0]) {
        bcrypt.compare(request.body.password, res.rows[0].password, (err, result) => {
          if (result) {
            response.send(true)
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
