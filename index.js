const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const DRY_RUN = process.env.DRY_RUN !== 'false';
const MONITOR_ALL_GROUPS = process.env.MONITOR_ALL_GROUPS === 'true';
const STRICT_LINK_MODE = process.env.STRICT_LINK_MODE !== 'false';
const PUNISH_ADMINS = process.env.PUNISH_ADMINS === 'true';
const SEND_GROUP_NOTICE = process.env.SEND_GROUP_NOTICE !== 'false';
const SESSION_PATH = process.env.SESSION_PATH || './.wwebjs_auth';
const LOG_DIR = process.env.LOG_DIR || './logs';

const GROUP_IDS = csv(process.env.GROUP_IDS).filter(id => id !== 'COLE_AQUI_O_ID_DO_GRUPO');

const BASE_ALLOWED_DOMAINS = [
  'shopee.com.br',
  's.shopee.com.br',
  'mercadolivre.com.br',
  'mercadolivre.com',
  'meli.la',
  'amazon.com.br',
  'amazon.com',
  'amzn.to',
  'a.co',
  'shein.com',
  'shein.com.br',
  'magazineluiza.com.br',
  'magalu.com',
  'kabum.com.br',
  'aliexpress.com',
  'netshoes.com.br',
  'dafiti.com.br',
  'casasbahia.com.br',
  'pontofrio.com.br',
  'extra.com.br',
  'carrefour.com.br',
  'americanas.com.br',
  'submarino.com.br'
];

const BASE_BANNED_DOMAINS = [
  'blaze.com',
  'bet365.com',
  'betano.com',
  'sportingbet.com',
  'superbet.com',
  'kto.com',
  'stake.com',
  '1xbet.com',
  'novibet.com',
  'estrelabet.com',
  'betfair.com',
  'betnacional.com',
  'parimatch.com',
  'vaidebet.com',
  'bet7k.com',
  'pixbet.com'
];

const BASE_BANNED_WORDS = [
  'tigrinho',
  'fortune tiger',
  'jogo do tigre',
  'bet',
  'bets',
  'aposta',
  'apostas',
  'cassino',
  'casino',
  'blaze',
  'aviator',
  'mines',
  'roleta',
  'betano',
  'bet365',
  'sportingbet',
  'superbet',
  'stake',
  '1xbet',
  'novibet',
  'estrelabet',
  'betfair',
  'betnacional',
  'parimatch',
  'vaidebet',
  'bet7k',
  'pixbet',
  'ganhe no pix',
  'ganhar no pix',
  'plataforma pagando',
  'hora pagante',
  'bug da plataforma',
  'dobrar dinheiro',
  'renda extra apostando',
  'sinais gratis',
  'grupo de sinais'
];

const ALLOWED_DOMAINS = unique([...BASE_ALLOWED_DOMAINS, ...csv(process.env.EXTRA_ALLOWED_DOMAINS)]);
const BANNED_DOMAINS = unique([...BASE_BANNED_DOMAINS, ...csv(process.env.EXTRA_BANNED_DOMAINS)]);
const BANNED_WORDS = unique([...BASE_BANNED_WORDS, ...csv(process.env.EXTRA_BANNED_WORDS)]);

let clientReady = false;
let lastQrAt = null;
let lastAction = null;

ensureDir(LOG_DIR);
ensureDir(SESSION_PATH);

const app = express();
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    name: 'Bot Anti-Bet WhatsApp',
    ready: clientReady,
    dryRun: DRY_RUN,
    monitorAllGroups: MONITOR_ALL_GROUPS,
    strictLinkMode: STRICT_LINK_MODE,
    groupIdsConfigured: GROUP_IDS.length,
    lastQrAt,
    lastAction
  });
});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Health server ativo na porta ${PORT}`);
});

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'bot-anti-bet',
    dataPath: SESSION_PATH
  }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

client.on('qr', (qr) => {
  lastQrAt = new Date().toISOString();
  console.log('\nEscaneie este QR Code com o WhatsApp do numero do bot:\n');
  qrcode.generate(qr, { small: true });
  console.log('\nNo celular: WhatsApp > Aparelhos conectados > Conectar aparelho.\n');
});

client.on('authenticated', () => {
  console.log('WhatsApp autenticado.');
});

client.on('auth_failure', (msg) => {
  console.error('Falha na autenticacao:', msg);
});

client.on('ready', async () => {
  clientReady = true;
  console.log('Bot conectado com sucesso.');
  console.log(`DRY_RUN: ${DRY_RUN ? 'ATIVADO' : 'DESATIVADO'}`);
  console.log(`STRICT_LINK_MODE: ${STRICT_LINK_MODE ? 'ATIVADO' : 'DESATIVADO'}`);

  const chats = await client.getChats();
  const groups = chats.filter(chat => chat.isGroup);

  console.log('\nGrupos encontrados:');
  groups.forEach(group => console.log(`${group.name} => ${group.id._serialized}`));

  if (!MONITOR_ALL_GROUPS && GROUP_IDS.length === 0) {
    console.log('\nNenhum GROUP_IDS configurado. Copie o ID do seu grupo e coloque na variavel GROUP_IDS.');
  }
});

client.on('disconnected', (reason) => {
  clientReady = false;
  console.log('Bot desconectado:', reason);
});

client.on('message', async (message) => {
  try {
    const chat = await message.getChat();
    if (!chat.isGroup) return;
    if (message.fromMe) return;
    if (!isMonitoredGroup(chat)) return;

    const participantId = message.author || message.from;
    if (!participantId) return;

    const text = message.body || '';
    const normalizedText = normalize(text);
    const urls = extractUrls(text);

    const hasLink = urls.length > 0;
    const hasBannedWord = containsBannedWord(normalizedText);
    const hasBannedDomain = urls.some(url => isBannedDomain(url));
    const hasOnlyAllowedLinks = hasLink && urls.every(url => isAllowedDomain(url));
    const hasUnknownLink = hasLink && !hasOnlyAllowedLinks;

    const shouldKickForLink = hasLink && (
      hasBannedDomain ||
      hasBannedWord ||
      (STRICT_LINK_MODE && hasUnknownLink)
    );

    if (shouldKickForLink) {
      await punishUser({
        message,
        chat,
        participantId,
        reason: buildReason({ hasBannedDomain, hasBannedWord, hasUnknownLink }),
        urls
      });
      return;
    }

    if (!hasLink && hasBannedWord) {
      await deleteOnly({
        message,
        chat,
        participantId,
        reason: 'Texto relacionado a apostas/tigrinho sem link'
      });
    }
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
  }
});

function isMonitoredGroup(chat) {
  if (MONITOR_ALL_GROUPS) return true;
  return GROUP_IDS.includes(chat.id._serialized);
}

function csv(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function unique(list) {
  return [...new Set(list.map(item => item.toLowerCase().trim()).filter(Boolean))];
}

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractUrls(text) {
  const normalized = String(text || '')
    .replace(/hxxps?:\/\//gi, 'https://')
    .replace(/\s+\.\s+/g, '.')
    .replace(/\s+\/\s+/g, '/');

  const regex = /(https?:\/\/[^\s]+|www\.[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;
  const matches = normalized.match(regex) || [];

  return matches.map(cleanUrl).filter(Boolean);
}

function cleanUrl(rawUrl) {
  try {
    let url = String(rawUrl).trim();
    url = url.replace(/[)\].,!?;:'"“”]+$/g, '');
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    return url;
  } catch {
    return null;
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function domainMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function isAllowedDomain(url) {
  const host = getHostname(url);
  return ALLOWED_DOMAINS.some(domain => domainMatches(host, domain));
}

function isBannedDomain(url) {
  const host = getHostname(url);
  return BANNED_DOMAINS.some(domain => domainMatches(host, domain));
}

function containsBannedWord(text) {
  return BANNED_WORDS.some(word => {
    const normalizedWord = normalize(word);
    const escaped = normalizedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i');
    return regex.test(text);
  });
}

function buildReason({ hasBannedDomain, hasBannedWord, hasUnknownLink }) {
  if (hasBannedDomain) return 'Link de dominio proibido relacionado a apostas/bet';
  if (hasBannedWord) return 'Link acompanhado de termo proibido relacionado a apostas/bet/tigrinho';
  if (hasUnknownLink) return 'Link fora da lista de lojas permitidas';
  return 'Link proibido';
}

async function isAdmin(chat, participantId) {
  try {
    const participant = chat.participants.find(p => p.id && p.id._serialized === participantId);
    return Boolean(participant && participant.isAdmin);
  } catch {
    return false;
  }
}

async function punishUser({ message, chat, participantId, reason, urls }) {
  const senderIsAdmin = await isAdmin(chat, participantId);

  const log = {
    date: new Date().toISOString(),
    action: senderIsAdmin && !PUNISH_ADMINS ? 'skip_admin' : DRY_RUN ? 'dry_run_kick' : 'kick',
    group: chat.name,
    groupId: chat.id._serialized,
    participantId,
    reason,
    message: message.body,
    urls
  };

  saveLog(log);
  lastAction = log;

  if (senderIsAdmin && !PUNISH_ADMINS) {
    console.log('Admin nao removido por configuracao PUNISH_ADMINS=false:', log);
    if (!DRY_RUN) {
      try { await message.delete(true); } catch (error) { console.error('Falha ao apagar mensagem de admin:', error.message); }
    }
    return;
  }

  if (DRY_RUN) {
    console.log('MODO TESTE: participante seria removido:', log);
    if (SEND_GROUP_NOTICE) {
      await chat.sendMessage(`Modo teste: link suspeito detectado.\n\nMotivo: ${reason}\n\nNenhuma acao real foi feita porque DRY_RUN=true.`);
    }
    return;
  }

  try {
    await message.delete(true);
    console.log('Mensagem apagada.');
  } catch (error) {
    console.error('Nao consegui apagar a mensagem. O bot e admin?', error.message);
  }

  try {
    await chat.removeParticipants([participantId]);
    console.log('Participante removido:', participantId);
  } catch (error) {
    console.error('Nao consegui remover o participante. O bot e admin?', error.message);
  }

  if (SEND_GROUP_NOTICE) {
    try {
      await chat.sendMessage('Participante removido automaticamente.\n\nMotivo: envio de link proibido ou fora das lojas permitidas do grupo.\n\nNao e permitido divulgar apostas, tigrinho, cassino, bet ou jogos de dinheiro.');
    } catch (error) {
      console.error('Nao consegui enviar aviso no grupo:', error.message);
    }
  }
}

async function deleteOnly({ message, chat, participantId, reason }) {
  const log = {
    date: new Date().toISOString(),
    action: DRY_RUN ? 'dry_run_delete' : 'delete',
    group: chat.name,
    groupId: chat.id._serialized,
    participantId,
    reason,
    message: message.body
  };

  saveLog(log);
  lastAction = log;

  if (DRY_RUN) {
    console.log('MODO TESTE: mensagem seria apagada:', log);
    return;
  }

  try {
    await message.delete(true);
    if (SEND_GROUP_NOTICE) {
      await chat.sendMessage('Mensagem removida por conter termo proibido relacionado a apostas/tigrinho.');
    }
  } catch (error) {
    console.error('Nao consegui apagar a mensagem:', error.message);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function saveLog(data) {
  ensureDir(LOG_DIR);
  const file = path.join(LOG_DIR, 'logs-anti-bet.jsonl');
  fs.appendFileSync(file, JSON.stringify(data) + '\n', 'utf8');
}

client.initialize();
