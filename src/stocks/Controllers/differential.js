const { calcPercentage, formatDate } = require('../../tools/tools')
const { historicalStockPrice, stockPrice } = require('../external/stocks')
const { getInitialInvestmentDate, getPercentageChange } = require('./analyticsTools')

const marketPercentageChange = async (purchases) => {
  const initialDate = await getInitialInvestmentDate(purchases)
  const formattedInitialDate = formatDate(initialDate)
  const initialPrice = await historicalStockPrice('VOO', formattedInitialDate)
  const currentPrice = await stockPrice('VOO')
  const percentageChange = calcPercentage(currentPrice, initialPrice)
  return percentageChange
}

module.exports.calcDifferential = async (purchases) => {
  const market = await marketPercentageChange(purchases)
  const user = await getPercentageChange(purchases)
  return Number(user)-Number(market)
}