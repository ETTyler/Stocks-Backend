const formatDate = (date) => {
  return date.toISOString().split('T')[0]
}

const calcPercentage = (currentValue, originalValue) => {
  return (((currentValue-originalValue)/originalValue)*100).toFixed(2)
}

const createChartData = (map, overallValue) => {
  let chartData = []
  for (const [key, value] of map.entries()) {
    const percentage = Number(value/overallValue*100).toFixed(2)
    chartData.push({
      name: key,
      y: Number(percentage)
    })
  }
  return chartData
}
  
const createStockArray = (priceData) => {
  const map = new Map()
  priceData.forEach(stock => 
    stock.forEach(day => {
      if (map.has(day[0])) {
        const existingValue = map.get(day[0])
        const newValue = Number(existingValue + day[1])
        map.set(day[0], newValue)
      }
      else {
        map.set(day[0], day[1]) 
      }
    })
  )
  const values = Array.from(map,([key, value]) => ([key, value]))
  const sortedValue = values.sort((a, b) => a[0] - b[0])
  return sortedValue
}



module.exports = { createChartData, formatDate, createStockArray, calcPercentage }