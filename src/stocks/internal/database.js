const { PrismaClient } = require('@prisma/client')
const Pool = require('pg').Pool

const prisma = new PrismaClient()
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


// Sales table

module.exports.sale = async (id, price, date, shares, ticker) => {
  try {
    const result = await prisma.sales.create({
      data: {
        userID: id,
        salePrice: price,
        saleDate: date,
        sharesSold: Number(shares),
        ticker: ticker
      }
    })
    return result
  }
  catch (error) {
    console.log(error)
  }
}


// Purchases tables

module.exports.purchase = async (ticker, date, price, shares, userID, value) => {
  await prisma.purchases.create({
    data: {
      ticker: ticker,
      date: date,
      priceBought: price,
      shares: Number(shares),
      userID: userID,
      value: Number(value)
    }
  })
}

module.exports.purchases = async (userID) => {
  return prisma.purchases.findMany({
    orderBy: [
      {
        date: 'asc'
      }
    ],
    where: {
      userID: userID
    }
  })
}

module.exports.getPurchasesFromDate = async (id, date) => {
  try {
    const res = await pool.query(`select * from "Purchases" WHERE
    "userID"=${id} AND "date"<'${date}';`)
    return res.rows
  } catch (err) {
    console.log(err.stack)
  }
}

module.exports.findPurchase = async (userID, order) => {
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


module.exports.deletePurchase = async (transactionID) => {
  pool.query(`DELETE FROM "Purchases" WHERE "transactionID" = ${transactionID};`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
  })
}

module.exports.updatePurchase = async (transactionID, value, shares) => {
  pool.query(`UPDATE "Purchases" 
  SET "value" = ${value}, "shares" = ${shares} 
  WHERE "transactionID" = ${transactionID};`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
  })
}

module.exports.updatePurchaseValue = async (price, ticker) => {
  pool.query(`UPDATE "Purchases" SET "value" = ${price}*"shares" 
  where "ticker" = '${ticker}';`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
  })
}

module.exports.changePurchase = async (price, value, shares, ticker, userID) => {
  pool.query(`UPDATE "Purchases" 
  SET "priceBought" = (${price}+"priceBought"/2), "value" = "value"+${value}, "shares" = "shares"+${shares} 
  WHERE "ticker" = '${ticker}' AND "userID" = ${userID};`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
  })
}

//Stocks table

module.exports.stocks = async () => {
  return prisma.stocks.findMany({
    orderBy: {
      Name: 'asc'
    }
  })
}

module.exports.updateStock = async (price, ticker) => {
  pool.query(`UPDATE "Stocks" SET "Price" = ${price} WHERE "Ticker" = '${ticker}';`, async (err, res) => {
    if (err) {
      console.log(err.stack)
    }
  })
}

module.exports.stockPurchases = async (id) => {
  try {
    const res = await pool.query(`select * from "Purchases" inner join "Stocks" ON
    "Purchases"."ticker"="Stocks"."Ticker" WHERE
    "Purchases"."userID"=${id} ORDER BY "value" desc;`)
    return res.rows
  } catch (err) {
    console.log(err.stack)
  }
} 

module.exports.stockPurchase = async (id, stock) => {
  try {
    const res = await pool.query(`select * from "Purchases" inner join "Stocks" ON
    "Purchases"."ticker"="Stocks"."Ticker" WHERE
    "Purchases"."userID"=${id} AND "Stocks"."Name"='${stock}'`)
    return res.rows
  } catch (err) {
    console.log(err.stack)
  }
}

module.exports.stockPurchaseByTicker = async (id, ticker) => {
  try {
    const res = await pool.query(`select * from "Purchases" inner join "Stocks" ON
    "Purchases"."ticker"="Stocks"."Ticker" WHERE
    "Purchases"."userID"=${id} AND "Purchases"."ticker"='${ticker}'`)
    return res.rows
  } catch (err) {
    console.log(err.stack)
  }
}

// friends table

module.exports.friends = async (userID) => {
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

// user table

module.exports.userInfo = async (userID) => {
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
