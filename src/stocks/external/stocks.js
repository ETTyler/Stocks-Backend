const axios = require('axios').default;

const stockPrice = async (ticker) => {
  return axios
    .get(`https://api.stockdata.org/v1/data/quote?symbols=${ticker}&api_token=${process.env.STOCK_API_KEY}`)
    .catch(error => {
      console.log(error.toJSON());
      return false
    })
    .then(res => {
      return res.data.data[0].price
    })
}

const historicalStockPrice = async (ticker, date) => {
  return axios
    .get(`https://api.stockdata.org/v1/data/eod?symbols=${ticker}&date=${date}&api_token=${process.env.STOCK_API_KEY}`)
    .catch(error => {
      console.log(error.toJSON());
    })
    .then(res => {
      return res.data.data[0].close
    })
}

const multipleStocks = async (tickers) => {
  return axios
    .get(`https://api.stockdata.org/v1/data/quote?symbols=${tickers.join()}&api_token=${process.env.STOCK_API_KEY}`)
    .catch(error => {
      console.log(error.toJSON());
      return false
    })
    .then(res => {
      return res.data.data
    })
}

const historicalData = async (ticker, dateFrom, dateTo, shares) => {
  return axios
    .get(`https://api.stockdata.org/v1/data/eod?symbols=${ticker}&date_from=${dateFrom}&date_to=${dateTo}&api_token=${process.env.STOCK_API_KEY}`)
    .catch(error => {
      console.log(error.toJSON());
    })
    .then(res => {
      const historicalPrices = res.data.data
      const stockPrice = historicalPrices.map(value =>
        [Date.parse(value.date),Number(value.close*shares)]
      )
      return stockPrice
  })
}

const historicalDataToNow = async (ticker, dateFrom, shares) => {
  return axios
    .get(`https://api.stockdata.org/v1/data/eod?symbols=${ticker}&date_from=${dateFrom}&api_token=${process.env.STOCK_API_KEY}`)
    .catch(error => {
      console.log(error.toJSON());
    })
    .then(res => {
      const historicalPrices = res.data.data
      const stockPrices = historicalPrices.map(value =>
        [Date.parse(value.date),Number(value.close*shares)]
      )
      return(stockPrices.sort())
    })
}

const news = async (stocks) => {
  return axios
    .get(`https://api.stockdata.org/v1/news/all?symbols=${stocks.join()}&filter_entities=true&language=en&exclude_domains=gurufocus.com,blueweaveconsulting.com&api_token=${process.env.STOCK_API_KEY}`)
    .catch(error => {
      console.log(error.toJSON());
    })
    .then(res => {
      const newsArticle = {
        stock: res.data.data[0].entities[0].name,
        title: res.data.data[0].title,
        description: res.data.data[0].description,
        url: res.data.data[0].url
      }
      return newsArticle
    })
}




module.exports = {stockPrice, historicalStockPrice, multipleStocks, historicalData, historicalDataToNow, news}