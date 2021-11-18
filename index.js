const express = require('express')
const app = express()
const cors = require('cors')

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
    console.log(request.body.email)
    if (users.find(user => user.email === request.body.email)) {
        response.send(true)
    }
    else {
        response.send('<script>alert()</script>')
    }
})

const PORT = 3001
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
