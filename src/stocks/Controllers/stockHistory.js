const database = require('../internal/database')
const { formatDate, createStockArray } = require('../../tools/tools')
const { historicalData } = require('../external/stocks')

module.exports.stockHistory = async (id) => {
  let stockPrices = []
  const purchases = await database.purchases(id)
  const tickers = purchases.map((purchase) => (
    {
      ticker: purchase.ticker,
      date: purchase.date,
      shares: purchase.shares
    }
  ))
  for await (const obj of tickers) {
    const date = formatDate(obj.date)
    const currentDate = new Date()
    currentDate.setDate(currentDate.getDate()-2)
    const apiDate = formatDate(currentDate)
    
    const stockPrice = await historicalData(obj.ticker, date, apiDate, obj.shares)
    stockPrices.push(stockPrice)
  }
  const graphData = createStockArray(stockPrices)
  return graphData
}