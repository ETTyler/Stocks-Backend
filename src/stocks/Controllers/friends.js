const { getPercentageChange } = require('./analyticsTools')
const database = require('../internal/database')

module.exports.friendsPercentages = async (userID) => {
  const friends = await database.friends(userID)
  const percentages =  friends.map(async friend => {
    const userInfo = await database.userInfo(friend.userID2)
    const friendPurchases = await database.purchases(friend.userID2)
    const percent = await getPercentageChange(friendPurchases)
    return {name: userInfo.name, percent}
  })
  const resolved = await Promise.all(percentages)
  return resolved
}