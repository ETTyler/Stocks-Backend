const Pool = require('pg').Pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'stocks',
  password: 'ZonedOnline123',
  port: 5432,
})

const login = (request, response) => {
    const { email, password } = request.body

    pool.query('SELECT * FROM users WHERE (email, password) = ($1, $2)', [email, password])
        if (error) {
            console.log(error.stack)
        }
        if (res.rows > 0) {
            response.send(true)
        }
        response.send(false)
}

exports.login = login