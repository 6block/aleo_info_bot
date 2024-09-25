const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');

// 设置 Telegram Bot 的 Token
const token = '7833363994:AAE8zLlAj_u9FEqUIZtJrC2J0JfIpdYl7Z0';  // 将 YOUR_TELEGRAM_BOT_TOKEN 替换为你从 BotFather 获得的 Token
const bot = new TelegramBot(token, { polling: true });

let lastMessageTime = 0;
const messageCooldown = 20000; // 20秒冷却时间

function sendMessage(chatId, text) {
    const currentTime = Date.now();
    if (currentTime - lastMessageTime < messageCooldown) {
        console.log(`消息发送过于频繁，需等待 ${messageCooldown / 1000} 秒后重试11`);
        return;
    }

    bot.sendMessage(chatId, text)
        .then(() => {
            lastMessageTime = Date.now();
        })
        .catch((error) => {
            if (error.code === 'ETELEGRAM' && error.response && error.response.body && error.response.body.description.includes('Too Many Requests')) {
                const retryAfter = parseInt(error.response.body.description.match(/\d+/)[0]) * 1000;
                console.log(`请求过于频繁，需等待 ${retryAfter / 1000} 秒后重试22`);
                setTimeout(() => sendMessage(chatId, text), retryAfter);
            } else {
                console.error('发送消息时发生错误:', error);
            }
        });
}

function formatTimeDifference(time) {
  const days = Math.floor(time / (24 * 3600)); // 1 day = 24 hours = 86400 seconds
  time %= (24 * 3600);
  
  const hours = Math.floor(time / 3600); // 1 hour = 3600 seconds
  time %= 3600;

  const minutes = Math.floor(time / 60); // 1 minute = 60 seconds
  const seconds = time % 60; // Remaining seconds

  let result = '';
  if (days > 0) {
    result += `${days} days `;
  }
  if (hours > 0 || days > 0) {
    result += `${hours} hours `;
  }
  result += `${minutes} min ${seconds < 10 ? '0' : ''}${seconds} ss`;

  return result.trim(); // 去掉多余空格
}

// 存储用户订阅的地址
let subscriptions = {};

// 处理 /start 命令，提示用户输入地址
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    `
      欢迎！\n
      请输入要监控的地址，例如: /subscribe aleo1xxxxxxx \n
      请输入要取消订阅的地址，例如: /unsubscribe aleo1xxxxxxx \n
      查看所有已订阅的地址: /list
    `
  );
  const languageCode = msg.from.language_code;
  bot.sendMessage(chatId, `当前语言是：${languageCode}`);
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
  for (const chatId in subscriptions) {
    const addresses = subscriptions[chatId];
    
    for (const address of addresses) {
      try {
        // 请求数据
        const response = await axios.get(`https://zk.work/api/aleo/miner/${address}/workerList?page=1&size=50&isActive=false&orderBy=currentHashRate&isAsc=false&nameKey=`);
        const records = response.data.data.records;

        // 遍历数据
        records.forEach(item => {
          let name = item.name.split(' ')[0]
          let time = Math.floor(new Date().getTime() / 1000) - item.lastSeenTimestamp

          sendMessage(chatId, `${name} 已掉线 ${formatTimeDifference(time)}`);
        });

      } catch (error) {
        sendMessage(chatId, `请求地址 ${address} 时发生错误:${error}`);
      }
    }
  }
});

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