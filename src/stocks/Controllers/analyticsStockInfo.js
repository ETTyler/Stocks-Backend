const { calcPercentage } = require('../../tools/tools')
const database = require('../internal/database')

module.exports.getPercentages = async (userID) => {
  const array = await database.stockPurchases(userID)
  const newArr = array.map(purchase => {
    const percentage = Number(calcPercentage(Number(purchase.Price),Number(purchase.priceBought)))
    const obj = {ticker: purchase.Ticker, percentage, LogoURL: purchase.LogoURL, name: purchase.Name }
    return obj
  })
  return newArr
}

module.exports.orderByPercentage = (arr, order) => {
  if (order === 'loss') {
    arr.sort((a,b) => {
      return(a.percentage - b.percentage)
    })
    return Object.values(arr)[0]
  }
  else {
    arr.sort((a,b) => {
      return(b.percentage - a.percentage)
    })
    return Object.values(arr)[0]
  }
}