const calcPercentage = require('../tools/tools').calcPercentage
const formatDate = require('../tools/tools').formatDate
const database = require('.././stocks/internal/database')
const api = require('.././stocks/external/stocks')

test('Percentage change of 10 to 15', () => {
  expect(calcPercentage(15, 10)).toBe('50.00');
});

test('Percentage change of 15 to 10', () => {
  expect(calcPercentage(10, 15)).toBe('-33.33');
});

test('Percentage change of 10 to 50', () => {
  expect(calcPercentage(50, 10)).toBe('400.00');
});

test('Percentage change of 2344.45 to 4346.38', () => {
  expect(calcPercentage(4346.38, 2344.45)).toBe('85.39');
});

test('convert ISO string to date', () => {
  const date = new Date('2022-04-27T00:27:52.454Z')
  expect(formatDate(date)).toBe('2022-04-27')
});

test('retrieve correct purchases from database', async () => {
  const purchases = await database.purchases(2)
  expect(purchases[0].userID).toBe(2)
})

test('retrieve correct stock price', async () => {
  const stockPrice = await api.historicalStockPrice('AAPL', '2022-02-04')
  expect(stockPrice).toBe(172.39)
})



