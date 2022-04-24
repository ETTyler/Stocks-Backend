const { calcPercentage } = require('../../tools/tools')

const getInvestment = async (purchases) => {
  const investment = purchases.reduce((previous, current) => {
    return Number(previous) + Number(current.priceBought)*Number(current.shares)
  }, 0)
  return investment.toFixed(2)
}
  
const getInitialInvestmentDate = async (purchases) => {
  const date = purchases[0].date
  return date
}

const getCurrentValue = async (purchases) => {
  const currentValue = purchases.reduce((previous, current) => {
    return Number(previous) + Number(current.value)
  }, 0)
  return currentValue.toFixed(2)
}

const getPercentageChange = async (purchases) => {
  const investment = await getInvestment(purchases)
  const currentValue = await getCurrentValue(purchases)
  return calcPercentage(currentValue, investment)
}

module.exports = {getInvestment, getInitialInvestmentDate, getCurrentValue, getPercentageChange}