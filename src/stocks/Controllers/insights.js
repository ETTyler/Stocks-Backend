const createMap = (map, purchase, chartType) => {
  if (map.has(chartType)) {
    const existingValue = map.get(chartType)
    const newValue = (Number(existingValue)+Number(purchase.value)).toFixed(2)
    map.set(chartType, newValue)
  }
  else {
    map.set(chartType, purchase.value)
  }
}

const insights = (stockPurchases) => {
  let portfolioValue = 0
  let positionMap = new Map()
  let sectorMap = new Map()
  let typeMap = new Map()

  stockPurchases.forEach(purchase => {
    portfolioValue += Number(purchase.value)
    createMap(sectorMap, purchase, purchase.Sector)
    createMap(typeMap, purchase, purchase.Type)
    positionMap.set(purchase.Name, purchase.value) 
  })
  return {sectorMap, typeMap, positionMap, portfolioValue}
}

module.exports = insights

