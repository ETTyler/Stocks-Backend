const { getInitialInvestmentDate } = require('./analyticsTools')
const { calcPercentage, formatDate } = require('../../tools/tools')
const { historicalData } = require('../external/stocks')

module.exports.convertToPercentage = (dataset, comparisonValue) => {
  const newDataset = dataset.map((element) => (
    [element[0], Number(calcPercentage(element[1], comparisonValue))]
  ))
  return (newDataset)
}

module.exports.marketDataset = async (purchases) => {
  const date = await getInitialInvestmentDate(purchases)
  const currentDate = new Date()
  currentDate.setDate(currentDate.getDate()-2)
  const apiDate = formatDate(currentDate)

  const historicalPrices = await historicalData('VOO', formatDate(date), apiDate, false)
  const index = historicalPrices.meta.returned
  const stockPrices = historicalPrices.data.map(value =>
    [Date.parse(value.date),Number(value.close)]
  )
  const marketData = {
    initialPrice: historicalPrices.data[index-1].close,
    dataset: stockPrices.sort()
  }
  return marketData
}