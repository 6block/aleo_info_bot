const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');

// 设置 Telegram Bot 的 Token
const token = '7833363994:AAE8zLlAj_u9FEqUIZtJrC2J0JfIpdYl7Z0';  // 将 YOUR_TELEGRAM_BOT_TOKEN 替换为你从 BotFather 获得的 Token
const bot = new TelegramBot(token, { polling: true });

const fs = require('fs');
const path = require('path');

// 定义文件路径
const subscriptionsFilePath = path.join(__dirname, 'subscriptions.json');

// 读取订阅数据
function loadSubscriptions() {
  if (fs.existsSync(subscriptionsFilePath)) {
      const data = fs.readFileSync(subscriptionsFilePath, 'utf8');
      try {
          return JSON.parse(data);
      } catch (error) {
          console.error('读取订阅数据时发生错误:', error);
          return {}; // 返回空对象以防止崩溃
      }
  }
  return {}; // 返回一个空对象，如果文件不存在
}

// 写入订阅数据
function saveSubscriptions() {
  fs.writeFileSync(subscriptionsFilePath, JSON.stringify(subscriptions, null, 2));
}

// 在此处加载订阅数据
let subscriptions = loadSubscriptions();


let lastMessageTime = 0;
const messageCooldown = 20000; // 20秒冷却时间

function sendMessage(chatId, text) {
    const currentTime = Date.now();
    if (currentTime - lastMessageTime < messageCooldown) {
        console.log(`消息发送过于频繁，需等待 ${messageCooldown / 1000} 秒后重试`);
        return;
    }

    bot.sendMessage(chatId, text)
        .then(() => {
            lastMessageTime = Date.now();
        })
        .catch((error) => {
            if (error.code === 'ETELEGRAM' && error.response && error.response.body && error.response.body.description.includes('Too Many Requests')) {
                const retryAfter = parseInt(error.response.body.description.match(/\d+/)[0]) * 1000;
                console.log(`请求过于频繁，需等待 ${retryAfter / 1000} 秒后重试`);
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


// 语言
let currentLanguage = ''; // zh  /  en

// 处理 /start 命令，提示用户输入地址
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  currentLanguage = msg.from.language_code.includes('zh') ? 'zh':'en'; // 默认语言是跟随telegram的语言(但只支持中英文)
  bot.sendMessage(chatId, 
    `
      \n
      ${currentLanguage === 'zh' ? '欢迎使用！':'Welcome!'}\n
      ${currentLanguage === 'zh' ? '请输入你想监控的地址，例如: ':'Please enter the address you want to monitor, for example:'}\n
      /subscribe aleo1xxxxxxx \n
      \n
      ${currentLanguage === 'zh' ? '如需取消订阅，请输入: ':'To unsubscribe, please enter:'} \n
      /unsubscribe aleo1xxxxxxx \n
      \n
      ${currentLanguage === 'zh' ? '查看你订阅的所有地址，请输入: ':'To view all your subscribed addresses, please enter:'} \n
      /list \n
      \n
      ${currentLanguage === 'zh' ? '语言默认跟随 Telegram 设置，手动切换语言可输入: ':'The default language follows your Telegram settings. To switch languages manually, enter:'}\n
      ●中文: /language zh \n
      ●English: /language en \n
      ${currentLanguage === 'zh' ? '当前语言: 简体中文 (zh)':'Current language: English (en)'}
      
    `
  );
});

// 处理 /language 命令，用户选择语言
bot.onText(/\/language (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  currentLanguage = match[1] === 'zh' ? 'zh':'en';
  bot.sendMessage(chatId, `${currentLanguage === 'zh' ? '当前语言: 简体中文 (zh)':'Current language: English (en)'}`);
});

// 处理 /subscribe 命令，用户订阅特定地址
bot.onText(/\/subscribe (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const address = match[1];

  if (!subscriptions[chatId]) {
      subscriptions[chatId] = [];
  }

  // 防止重复订阅
  if (!subscriptions[chatId].includes(address)) {
      subscriptions[chatId].push(address);
      bot.sendMessage(chatId, `${currentLanguage === 'zh' ? '你已成功订阅地址: ':'You have successfully subscribed to the address: '}${address}`);
      saveSubscriptions(); // 订阅后保存数据
  } else {
      bot.sendMessage(chatId, `${currentLanguage === 'zh' ? '你已经订阅了该地址: ':'You have already subscribed to this address: '}${address} ${address}`);
  }
});


// 定时任务每隔5分钟检查订阅的地址
cron.schedule('*/5 * * * *', async () => {
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
          let text = '';
          if(currentLanguage === 'zh'){
            text = `${name} 已掉线 ${formatTimeDifference(time)}`;
          }else{
            text = `${name} has been offline for ${formatTimeDifference(time)}`
          }
          sendMessage(chatId, text);
        });

      } catch (error) {
        let text = '';
        if(currentLanguage === 'zh'){
          text = `请求地址 ${address} 时发生错误:${error}`;
        }else{
          text = `Error occurred while requesting address ${address}: ${error}`
        }
        sendMessage(chatId, text);
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
      bot.sendMessage(chatId, `${currentLanguage === 'zh' ? '你已取消订阅地址: ':'You have unsubscribed from the address: '}${address}`);
      saveSubscriptions(); // 取消订阅后保存数据
  } else {
      bot.sendMessage(chatId, `${currentLanguage === 'zh' ? '你没有订阅该地址: ':'You have not subscribed to this address: '}${address}`);
  }
});


// 处理 /list 命令，列出所有已订阅的地址
bot.onText(/\/list/, (msg) => {
  const chatId = msg.chat.id;

  if (subscriptions[chatId] && subscriptions[chatId].length > 0) {
      bot.sendMessage(chatId, `${currentLanguage === 'zh' ? '你订阅的地址有:':'The addresses you have subscribed to are:'} \n ${subscriptions[chatId].join(', ')}`);
  } else {
      bot.sendMessage(chatId, `${currentLanguage === 'zh' ? '你还没有订阅任何地址':'You have not subscribed to any addresses yet'}`);
  }
});

bot.on("polling_error", (error) => {
  console.error("Polling error:", error);
});