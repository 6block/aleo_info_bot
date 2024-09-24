const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');

// 设置 Telegram Bot 的 Token
const token = '7833363994:AAE8zLlAj_u9FEqUIZtJrC2J0JfIpdYl7Z0';  // 将 YOUR_TELEGRAM_BOT_TOKEN 替换为你从 BotFather 获得的 Token
const bot = new TelegramBot(token, { polling: true });

// 存储用户订阅的地址
let subscriptions = {};

// 处理 /start 命令，提示用户输入地址
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '欢迎！请输入要监控的地址，例如 /subscribe a1');
});

// 处理 /subscribe 命令，用户订阅特定地址
bot.onText(/\/subscribe (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const address = match[1];  // 用户输入的地址 a1
  
  if (!subscriptions[chatId]) {
    subscriptions[chatId] = [];
  }

  // 防止重复订阅
  if (!subscriptions[chatId].includes(address)) {
    subscriptions[chatId].push(address);
    bot.sendMessage(chatId, `你已成功订阅地址: ${address}`);
  } else {
    bot.sendMessage(chatId, `你已经订阅了该地址: ${address}`);
  }
});

// 定时任务每隔1分钟检查订阅的地址
cron.schedule('*/1 * * * *', async () => {
  // bot.sendMessage(chatId, '正在检查订阅的地址...');
  for (const chatId in subscriptions) {
    const addresses = subscriptions[chatId];
    
    for (const address of addresses) {
      try {
        bot.sendMessage(chatId, `address===${address}`);
        // 请求数据
        const response = await axios.get(`https://zk.work/api/aleo/miner/${address}/workerList?page=1&size=50&isActive=false&orderBy=currentHashRate&isAsc=false&nameKey=`);
        bot.sendMessage(chatId, `返回的数据为：${JSON.stringify(response.data.data.records)}`);
        const records = response.data.data.records;

        // 遍历数据
        records.forEach(item => {
          let name = item.name.split(' ')[0]
          let time = item.lastSeenTimestamp - Math.floor(new Date().getTime() / 1000)

          bot.sendMessage(chatId, `${name} 已掉线 ${formatTimeDifference(time)}`);
        });

      } catch (error) {
        bot.sendMessage(chatId, `请求地址 ${address} 时发生错误:${error}`);
      }
    }
  }
});

function formatTimeDifference(timeInSeconds) {
  let result = '';
  const seconds = timeInSeconds % 60; // Remaining seconds
  const minutes = timeInSeconds / 60; // 1 minute = 60 seconds
  const hours = timeInSeconds / 60 / 60
  const days = timeInSeconds / 60 / 60 / 60
  if(days > 1){
    result = `${days} days `
  }
  if(hours > 1){
    result = result + `${hours} hours `
  }
  if(minutes > 1){
    result = result + `${minutes} minutes `
  }
  result = result + `${seconds} seconds`
  return result;
}

// 处理 /unsubscribe 命令，用户取消订阅
bot.onText(/\/unsubscribe (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const address = match[1];

  if (subscriptions[chatId] && subscriptions[chatId].includes(address)) {
    subscriptions[chatId] = subscriptions[chatId].filter(addr => addr !== address);
    bot.sendMessage(chatId, `你已取消订阅地址: ${address}`);
  } else {
    bot.sendMessage(chatId, `你没有订阅该地址: ${address}`);
  }
});

// 处理 /list 命令，列出所有已订阅的地址
bot.onText(/\/list/, (msg) => {
  const chatId = msg.chat.id;

  if (subscriptions[chatId] && subscriptions[chatId].length > 0) {
    bot.sendMessage(chatId, `你订阅的地址有: ${subscriptions[chatId].join(', ')}`);
  } else {
    bot.sendMessage(chatId, '你还没有订阅任何地址');
  }
});

bot.on("polling_error", (error) => {
  console.error("Polling error:", error);
});