const database = require('../internal/database')
const { historicalStockPrice } = require('../external/stocks')
const { getCurrentValue } = require('./analyticsTools')
const { calcPercentage } = require('../../tools/tools')

module.exports.getPercentagesFromDate = async (userID, date) => {
  const friends = await database.friends(userID)
  
  const percentages = friends.map(async friend => {
    const userInfo = await database.userInfo(friend.userID2)
    const friendPortfolio = await database.purchases(friend.userID2)
    const currentValue = await getCurrentValue(friendPortfolio)
    const purchases = await database.getPurchasesFromDate(friend.userID2, date)
    
    const tickers = purchases.map(purchase => (
      {
        ticker: purchase.ticker,
        shares: purchase.shares
      }
    ))
    
    let dateValue = 0
    for await (const obj of tickers) {
      const closePrice = await historicalStockPrice(obj.ticker, date)
      dateValue += (closePrice*Number(obj.shares))
    }
    const percentageChange = calcPercentage(currentValue, dateValue)
    return {name: userInfo.name, percent: Number(percentageChange) }
  })
  const resolved = await Promise.all(percentages)
  return resolved
}