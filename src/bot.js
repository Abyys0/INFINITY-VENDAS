require('dotenv').config();
const http = require('http');
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
  MessageFlags
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ==================== HANDLER DE ERROS GLOBAL ====================
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error.message || error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message || error);
});

// ==================== SERVIDOR HTTP PARA RENDER ====================
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    status: 'online', 
    bot: 'INFINITY VENDAS',
    uptime: process.uptime()
  }));
});

server.listen(PORT, () => {
  console.log(`🌐 Servidor HTTP rodando na porta ${PORT}`);
});

// ==================== CONFIGURAÇÕES ====================
const GUILD_ID = process.env.GUILD_ID;
const ADMIN_ROLES = process.env.ADMIN_ROLES?.split(',') || [];

// ==================== CONFIGURAÇÕES SISTEMA DE SUPORTE ====================
const SUPPORT_CHANNEL_ID = '1459394113421185087'; // Canal onde fica o painel de suporte
const SUPPORT_CATEGORY_ID = '1452524577581433034'; // Categoria onde os tickets são criados
const SUPPORT_ROLES = ['1452818415935819776', '1453187121870540800']; // Cargos de suporte

// ==================== BANCO DE DADOS JSON ====================
const DATA_FILE = path.join(__dirname, '..', 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      // Garantir que os campos de suporte existam
      if (!data.supportTickets) data.supportTickets = [];
      if (!data.nextSupportTicketId) data.nextSupportTicketId = 1;
      return data;
    }
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
  }
  return { products: [], nextId: 1, config: {}, tickets: [], supportTickets: [], nextSupportTicketId: 1 };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Erro ao salvar dados:', error);
  }
}

let db = loadData();

// Funções do banco
function getAllProducts() {
  return db.products.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getProductById(id) {
  return db.products.find(p => p.id === parseInt(id));
}

function createProduct(data) {
  const product = {
    id: db.nextId++,
    name: data.name,
    description: data.description || '',
    price: parseFloat(data.price),
    image_url: data.image_url || '',
    stock: parseInt(data.stock) || 0,
    category: data.category || 'Geral',
    channel_id: data.channel_id || '',
    message_id: null,
    created_at: new Date().toISOString()
  };
  db.products.push(product);
  saveData(db);
  return product;
}

function updateProduct(id, data) {
  const index = db.products.findIndex(p => p.id === parseInt(id));
  if (index === -1) return null;
  db.products[index] = { ...db.products[index], ...data };
  saveData(db);
  return db.products[index];
}

function deleteProduct(id) {
  const index = db.products.findIndex(p => p.id === parseInt(id));
  if (index === -1) return false;
  db.products.splice(index, 1);
  saveData(db);
  return true;
}

// ==================== CLIENTE DISCORD ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

// ==================== COMANDO SLASH ====================
const commands = [
  new SlashCommandBuilder()
    .setName('painelvendas')
    .setDescription('Abrir painel de gerenciamento da loja')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('painelsuporte')
    .setDescription('Enviar painel de suporte no canal configurado')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

// ==================== FUNÇÕES DE EMBED ====================
function createProductEmbed(product) {
  const stockStatus = product.stock > 0 
    ? `✅ ${product.stock} disponíveis` 
    : '❌ Esgotado';

  const embed = new EmbedBuilder()
    .setTitle(`🛒 ${product.name}`)
    .setDescription(product.description || '*Sem descrição*')
    .setColor(product.stock > 0 ? 0x57F287 : 0xED4245)
    .addFields(
      { name: '💰 Preço', value: `\`R$ ${product.price.toFixed(2)}\``, inline: true },
      { name: '📦 Estoque', value: stockStatus, inline: true },
      { name: '📁 Categoria', value: product.category || 'Geral', inline: true }
    )
    .setFooter({ text: `ID: ${product.id} • 🏪 INFINITY VENDAS` })
    .setTimestamp();

  if (product.image_url) {
    embed.setImage(product.image_url);
  }

  return embed;
}

function createProductButtons(productId, inStock = true) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`buy_${productId}`)
        .setLabel('🛒 Comprar')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!inStock),
      new ButtonBuilder()
        .setCustomId(`info_${productId}`)
        .setLabel('ℹ️ Detalhes')
        .setStyle(ButtonStyle.Secondary)
    );
}

// ==================== PAINEL DE ADMIN ====================
function createAdminPanel() {
  const embed = new EmbedBuilder()
    .setTitle('🏪 INFINITY VENDAS - Painel Admin')
    .setDescription('Gerencie sua loja através dos botões abaixo')
    .setColor(0x5865F2)
    .addFields(
      { name: '📦 Produtos', value: 'Adicionar, editar, remover e enviar produtos', inline: false },
      { name: '⚙️ Configurações', value: 'Definir canal de logs e outras opções', inline: false }
    )
    .setFooter({ text: 'INFINITY VENDAS • Painel de Administração' })
    .setTimestamp();

  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('admin_add')
        .setLabel('➕ Adicionar Produto')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('admin_list')
        .setLabel('📋 Listar Produtos')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('admin_edit')
        .setLabel('✏️ Editar Produto')
        .setStyle(ButtonStyle.Secondary)
    );

  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('admin_delete')
        .setLabel('🗑️ Remover Produto')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('admin_send')
        .setLabel('📢 Enviar no Canal')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('admin_stock')
        .setLabel('📦 Alterar Estoque')
        .setStyle(ButtonStyle.Secondary)
    );

  const row3 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('admin_logs')
        .setLabel('📝 Config. Logs')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('admin_tickets')
        .setLabel('🎫 Ver Tickets')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('admin_support_tickets')
        .setLabel('🆘 Tickets Suporte')
        .setStyle(ButtonStyle.Secondary)
    );

  return { embed, components: [row1, row2, row3] };
}

// ==================== CRIAR TICKET ====================
async function createTicket(guild, user, product) {
  try {
    // Permissões do ticket - apenas quem abriu e admins podem ver
    const permissionOverwrites = [
      {
        id: guild.id, // @everyone
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: user.id, // Usuário que abriu
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ];

    // Adicionar cargos de admin que podem ver
    for (const roleId of ADMIN_ROLES) {
      if (roleId && roleId.trim()) {
        permissionOverwrites.push({
          id: roleId.trim(),
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels
          ]
        });
      }
    }

    // Criar canal do ticket
    const ticketChannel = await guild.channels.create({
      name: `🎫│${user.username}-${product.id}`,
      type: ChannelType.GuildText,
      permissionOverwrites
    });

    // Embed do ticket
    const embed = new EmbedBuilder()
      .setTitle('🎫 Ticket de Compra')
      .setDescription(`Olá ${user}! Você está comprando:`)
      .setColor(0x57F287)
      .addFields(
        { name: '📦 Produto', value: product.name, inline: true },
        { name: '💰 Valor', value: `R$ ${product.price.toFixed(2)}`, inline: true },
        { name: '🆔 ID', value: `${product.id}`, inline: true }
      )
      .setFooter({ text: 'Aguarde um administrador para finalizar a compra' })
      .setTimestamp();

    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_confirm_${product.id}`)
          .setLabel('✅ Confirmar Entrega')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ticket_cancel_${product.id}`)
          .setLabel('❌ Cancelar Compra')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('🔒 Fechar Ticket')
          .setStyle(ButtonStyle.Secondary)
      );

    await ticketChannel.send({ 
      content: `${user} | ${ADMIN_ROLES.filter(r => r && r.trim()).map(r => `<@&${r.trim()}>`).join(' ')}`,
      embeds: [embed], 
      components: [buttons] 
    });

    // Salvar ticket no banco
    if (!db.tickets) db.tickets = [];
    db.tickets.push({
      channel_id: ticketChannel.id,
      user_id: user.id,
      product_id: product.id,
      created_at: new Date().toISOString(),
      closed: false
    });
    saveData(db);

    return ticketChannel;
  } catch (error) {
    console.error('Erro ao criar ticket:', error);
    return null;
  }
}

// ==================== SISTEMA DE SUPORTE ====================

// Criar painel de suporte
function createSupportPanelEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('🎫 Central de Suporte')
    .setDescription('Precisa de ajuda? Clique no botão abaixo para abrir um ticket de suporte!\n\n' +
      '**📋 Regras:**\n' +
      '• Descreva seu problema detalhadamente\n' +
      '• Aguarde um membro da equipe responder\n' +
      '• Não abra múltiplos tickets para o mesmo assunto\n' +
      '• Seja educado e paciente')
    .setColor(0x5865F2)
    .setFooter({ text: '🏪 INFINITY VENDAS • Suporte' })
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('support_open_ticket')
        .setLabel('📩 Abrir Ticket')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫')
    );

  return { embed, components: [row] };
}

// Criar ticket de suporte
async function createSupportTicket(guild, user, subject) {
  try {
    // Verificar se já tem ticket aberto
    if (!db.supportTickets) db.supportTickets = [];
    const existingTicket = db.supportTickets.find(t => t.user_id === user.id && !t.closed);
    if (existingTicket) {
      return { error: 'already_open', channel_id: existingTicket.channel_id };
    }

    // Gerar número do ticket
    if (!db.nextSupportTicketId) db.nextSupportTicketId = 1;
    const ticketNumber = db.nextSupportTicketId++;
    saveData(db);

    // Permissões do ticket
    const permissionOverwrites = [
      {
        id: guild.id, // @everyone
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: user.id, // Usuário que abriu
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks
        ]
      }
    ];

    // Adicionar cargos de suporte
    for (const roleId of SUPPORT_ROLES) {
      if (roleId && roleId.trim()) {
        permissionOverwrites.push({
          id: roleId.trim(),
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.ManageMessages
          ]
        });
      }
    }

    // Criar canal do ticket na categoria especificada
    const ticketChannel = await guild.channels.create({
      name: `🎫│ticket-${ticketNumber}`,
      type: ChannelType.GuildText,
      parent: SUPPORT_CATEGORY_ID,
      permissionOverwrites
    });

    // Embed do ticket
    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket de Suporte #${ticketNumber}`)
      .setDescription(`Olá ${user}! Bem-vindo ao suporte.\n\nDescreva seu problema detalhadamente e aguarde um membro da equipe.`)
      .setColor(0x5865F2)
      .addFields(
        { name: '👤 Aberto por', value: `${user}`, inline: true },
        { name: '📋 Assunto', value: subject || 'Não especificado', inline: true },
        { name: '📅 Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        { name: '🔓 Status', value: '`Aguardando Atendimento`', inline: true },
        { name: '👨‍💼 Atendente', value: '`Nenhum`', inline: true }
      )
      .setFooter({ text: '🏪 INFINITY VENDAS • Suporte' })
      .setTimestamp();

    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('support_claim')
          .setLabel('👋 Assumir Ticket')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('support_call')
          .setLabel('📢 Chamar Suporte')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('support_close')
          .setLabel('🔒 Fechar Ticket')
          .setStyle(ButtonStyle.Danger)
      );

    const message = await ticketChannel.send({ 
      content: `${user} | Equipe de Suporte: ${SUPPORT_ROLES.map(r => `<@&${r}>`).join(' ')}`,
      embeds: [embed], 
      components: [buttons] 
    });

    // Salvar ticket no banco
    db.supportTickets.push({
      id: ticketNumber,
      channel_id: ticketChannel.id,
      message_id: message.id,
      user_id: user.id,
      subject: subject || 'Não especificado',
      claimed_by: null,
      created_at: new Date().toISOString(),
      closed: false
    });
    saveData(db);

    return { success: true, channel: ticketChannel, ticketNumber };
  } catch (error) {
    console.error('Erro ao criar ticket de suporte:', error);
    return { error: 'create_failed' };
  }
}

// Verificar se usuário tem cargo de suporte
function hasSupportRole(member) {
  return SUPPORT_ROLES.some(roleId => member.roles.cache.has(roleId));
}

// ==================== ENVIAR PRODUTO NO CANAL ====================
async function sendProductToChannel(product, channel) {
  try {
    const embed = createProductEmbed(product);
    const buttons = createProductButtons(product.id, product.stock > 0);
    const message = await channel.send({ embeds: [embed], components: [buttons] });
    updateProduct(product.id, { message_id: message.id, channel_id: channel.id });
    return message;
  } catch (error) {
    console.error('Erro ao enviar produto:', error);
    return null;
  }
}

// ==================== ATUALIZAR MENSAGEM DO PRODUTO ====================
async function updateProductMessage(product) {
  try {
    if (!product || !product.channel_id || !product.message_id) return false;
    const channel = await client.channels.fetch(product.channel_id);
    if (!channel) return false;
    const message = await channel.messages.fetch(product.message_id).catch(() => null);
    if (!message) return false;
    const embed = createProductEmbed(product);
    const buttons = createProductButtons(product.id, product.stock > 0);
    await message.edit({ embeds: [embed], components: [buttons] });
    return true;
  } catch (error) {
    console.error('Erro ao atualizar mensagem:', error);
    return false;
  }
}

// ==================== EVENTO READY ====================
client.once('clientReady', async () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║         🛒 INFINITY VENDAS - BOT ATIVO           ║
╠══════════════════════════════════════════════════╣
║  Bot: ${client.user.tag.padEnd(40)} ║
║  Servidores: ${String(client.guilds.cache.size).padEnd(35)} ║
║  Produtos: ${String(db.products.length).padEnd(37)} ║
╚══════════════════════════════════════════════════╝
  `);
  
  try {
    // Registrar comandos em cada servidor (aparece instantaneamente)
    for (const guild of client.guilds.cache.values()) {
      await guild.commands.set(commands);
      console.log(`✅ Comandos registrados no servidor: ${guild.name}`);
    }
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }
  
  client.user.setPresence({
    activities: [{ name: '🛒 INFINITY VENDAS', type: 3 }],
    status: 'online'
  });
});

// ==================== HANDLER DE INTERAÇÕES ====================
client.on('interactionCreate', async (interaction) => {
  try {
    // ========== COMANDO /painelvendas ==========
    if (interaction.isChatInputCommand() && interaction.commandName === 'painelvendas') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const panel = createAdminPanel();
      await interaction.editReply({ embeds: [panel.embed], components: panel.components });
      return;
    }

    // ========== COMANDO /painelsuporte ==========
    if (interaction.isChatInputCommand() && interaction.commandName === 'painelsuporte') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const supportChannel = await interaction.guild.channels.fetch(SUPPORT_CHANNEL_ID).catch(() => null);
        if (!supportChannel) {
          await interaction.editReply({ 
            content: `❌ Canal de suporte não encontrado! Verifique o ID: \`${SUPPORT_CHANNEL_ID}\``
          });
          return;
        }

        const panel = createSupportPanelEmbed();
        await supportChannel.send({ embeds: [panel.embed], components: panel.components });
        await interaction.editReply({ 
          content: `✅ Painel de suporte enviado em ${supportChannel}!`
        });
      } catch (error) {
        console.error('Erro ao enviar painel de suporte:', error);
        await interaction.editReply({ content: '❌ Erro ao enviar painel de suporte.' }).catch(() => {});
      }
      return;
    }

  // ========== BOTÕES ==========
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // ----- PAINEL ADMIN: Adicionar Produto -----
    if (customId === 'admin_add') {
      const modal = new ModalBuilder()
        .setCustomId('modal_add_product')
        .setTitle('➕ Adicionar Produto');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Nome do Produto')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('price')
            .setLabel('Preço (ex: 29.90)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Descrição')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('stock')
            .setLabel('Estoque')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('0')
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('image')
            .setLabel('URL da Imagem')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );

      await interaction.showModal(modal);
    }

    // ----- PAINEL ADMIN: Listar Produtos -----
    if (customId === 'admin_list') {
      const products = getAllProducts();
      
      if (products.length === 0) {
        return interaction.reply({ 
          content: '📭 Nenhum produto cadastrado.\nClique em **➕ Adicionar Produto** para começar!', 
          flags: MessageFlags.Ephemeral 
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Lista de Produtos')
        .setColor(0x5865F2)
        .setDescription(products.map(p => 
          `**#${p.id}** • ${p.name}\n└ 💰 R$ ${p.price.toFixed(2)} • 📦 ${p.stock} un`
        ).join('\n\n'))
        .setFooter({ text: `Total: ${products.length} produtos` });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ----- PAINEL ADMIN: Editar Produto -----
    if (customId === 'admin_edit') {
      const products = getAllProducts();
      if (products.length === 0) {
        return interaction.reply({ content: '📭 Nenhum produto para editar.', flags: MessageFlags.Ephemeral });
      }

      const options = products.slice(0, 25).map(p => ({
        label: `#${p.id} - ${p.name}`.slice(0, 100),
        value: `edit_${p.id}`,
        description: `R$ ${p.price.toFixed(2)} • ${p.stock} un`
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_edit')
          .setPlaceholder('Selecione um produto para editar')
          .addOptions(options)
      );

      await interaction.reply({ content: '✏️ Selecione o produto que deseja editar:', components: [row], flags: MessageFlags.Ephemeral });
    }

    // ----- PAINEL ADMIN: Remover Produto -----
    if (customId === 'admin_delete') {
      const products = getAllProducts();
      if (products.length === 0) {
        return interaction.reply({ content: '📭 Nenhum produto para remover.', flags: MessageFlags.Ephemeral });
      }

      const options = products.slice(0, 25).map(p => ({
        label: `#${p.id} - ${p.name}`.slice(0, 100),
        value: `delete_${p.id}`,
        description: `R$ ${p.price.toFixed(2)} • ${p.stock} un`
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_delete')
          .setPlaceholder('Selecione um produto para remover')
          .addOptions(options)
      );

      await interaction.reply({ content: '🗑️ Selecione o produto que deseja remover:', components: [row], flags: MessageFlags.Ephemeral });
    }

    // ----- PAINEL ADMIN: Enviar no Canal -----
    if (customId === 'admin_send') {
      const products = getAllProducts();
      if (products.length === 0) {
        return interaction.reply({ content: '📭 Nenhum produto para enviar.', flags: MessageFlags.Ephemeral });
      }

      const options = products.slice(0, 25).map(p => ({
        label: `#${p.id} - ${p.name}`.slice(0, 100),
        value: `send_${p.id}`,
        description: `R$ ${p.price.toFixed(2)} • ${p.stock} un`
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_send')
          .setPlaceholder('Selecione um produto para enviar')
          .addOptions(options)
      );

      await interaction.reply({ content: '📢 Selecione o produto para enviar no canal:', components: [row], flags: MessageFlags.Ephemeral });
    }

    // ----- PAINEL ADMIN: Alterar Estoque -----
    if (customId === 'admin_stock') {
      const products = getAllProducts();
      if (products.length === 0) {
        return interaction.reply({ content: '📭 Nenhum produto cadastrado.', flags: MessageFlags.Ephemeral });
      }

      const options = products.slice(0, 25).map(p => ({
        label: `#${p.id} - ${p.name}`.slice(0, 100),
        value: `stock_${p.id}`,
        description: `Estoque atual: ${p.stock} un`
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_stock')
          .setPlaceholder('Selecione um produto')
          .addOptions(options)
      );

      await interaction.reply({ content: '📦 Selecione o produto para alterar estoque:', components: [row], flags: MessageFlags.Ephemeral });
    }

    // ----- PAINEL ADMIN: Config Logs -----
    if (customId === 'admin_logs') {
      const modal = new ModalBuilder()
        .setCustomId('modal_logs')
        .setTitle('📝 Canal de Logs');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('channel_id')
            .setLabel('ID do Canal de Logs')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: 123456789012345678')
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
    }

    // ----- PAINEL ADMIN: Ver Tickets -----
    if (customId === 'admin_tickets') {
      const tickets = db.tickets || [];
      const openTickets = tickets.filter(t => !t.closed);

      if (openTickets.length === 0) {
        return interaction.reply({ content: '🎫 Nenhum ticket aberto no momento.', flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle('🎫 Tickets Abertos')
        .setColor(0x5865F2)
        .setDescription(openTickets.map(t => 
          `<#${t.channel_id}> • Produto #${t.product_id} • <@${t.user_id}>`
        ).join('\n'));

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ----- PAINEL ADMIN: Ver Tickets de Suporte -----
    if (customId === 'admin_support_tickets') {
      const supportTickets = db.supportTickets || [];
      const openTickets = supportTickets.filter(t => !t.closed);

      if (openTickets.length === 0) {
        return interaction.reply({ content: '🆘 Nenhum ticket de suporte aberto no momento.', flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle('🆘 Tickets de Suporte Abertos')
        .setColor(0x5865F2)
        .setDescription(openTickets.map(t => {
          const status = t.claimed_by ? `✅ Assumido por <@${t.claimed_by}>` : '⏳ Aguardando';
          return `**#${t.id}** • <#${t.channel_id}>\n└ 👤 <@${t.user_id}> • ${status}`;
        }).join('\n\n'))
        .setFooter({ text: `Total: ${openTickets.length} tickets abertos` });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ----- COMPRAR PRODUTO -----
    if (customId.startsWith('buy_')) {
      const productId = customId.split('_')[1];
      const product = getProductById(productId);

      if (!product) {
        return interaction.reply({ content: '❌ Produto não encontrado!', flags: MessageFlags.Ephemeral });
      }

      if (product.stock <= 0) {
        return interaction.reply({ content: '❌ Produto esgotado!', flags: MessageFlags.Ephemeral });
      }

      // Criar ticket
      const ticket = await createTicket(interaction.guild, interaction.user, product);
      
      if (ticket) {
        await interaction.reply({ 
          content: `🎫 Ticket criado! Acesse ${ticket} para finalizar sua compra.`, 
          flags: MessageFlags.Ephemeral 
        });
      } else {
        await interaction.reply({ content: '❌ Erro ao criar ticket.', flags: MessageFlags.Ephemeral });
      }
    }

    // ----- INFO PRODUTO -----
    if (customId.startsWith('info_')) {
      const productId = customId.split('_')[1];
      const product = getProductById(productId);

      if (!product) {
        return interaction.reply({ content: '❌ Produto não encontrado!', flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📋 ${product.name}`)
        .setDescription(product.description || '*Sem descrição*')
        .setColor(0x5865F2)
        .addFields(
          { name: '💰 Preço', value: `R$ ${product.price.toFixed(2)}`, inline: true },
          { name: '📦 Estoque', value: `${product.stock} un`, inline: true },
          { name: '🆔 ID', value: `${product.id}`, inline: true }
        );

      if (product.image_url) embed.setThumbnail(product.image_url);

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ----- TICKET: Confirmar Entrega -----
    if (customId.startsWith('ticket_confirm_')) {
      const productId = customId.split('_')[2];
      const product = getProductById(productId);

      if (product && product.stock > 0) {
        updateProduct(product.id, { stock: product.stock - 1 });
        await updateProductMessage(product);
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ Compra Finalizada!')
        .setDescription('Produto entregue com sucesso.')
        .setColor(0x57F287)
        .setTimestamp();

      await interaction.update({ embeds: [embed], components: [] });

      // Log
      if (db.config?.logs_channel) {
        try {
          const logsChannel = await client.channels.fetch(db.config.logs_channel);
          const ticket = db.tickets?.find(t => t.channel_id === interaction.channel.id);
          
          const logEmbed = new EmbedBuilder()
            .setTitle('✅ Venda Confirmada')
            .setColor(0x57F287)
            .addFields(
              { name: '👤 Comprador', value: `<@${ticket?.user_id}>`, inline: true },
              { name: '📦 Produto', value: product?.name || 'N/A', inline: true },
              { name: '💰 Valor', value: `R$ ${product?.price?.toFixed(2) || '0.00'}`, inline: true }
            )
            .setTimestamp();

          await logsChannel.send({ embeds: [logEmbed] });
        } catch (e) {
          console.error('Erro ao enviar log:', e);
        }
      }

      // Marcar ticket como fechado
      const ticketIndex = db.tickets?.findIndex(t => t.channel_id === interaction.channel.id);
      if (ticketIndex > -1) {
        db.tickets[ticketIndex].closed = true;
        saveData(db);
      }

      // Fechar ticket após 5 segundos
      setTimeout(async () => {
        try {
          await interaction.channel.delete();
        } catch (e) {
          console.error('Erro ao deletar canal:', e);
        }
      }, 5000);
    }

    // ----- TICKET: Cancelar -----
    if (customId.startsWith('ticket_cancel_')) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Compra Cancelada')
        .setDescription('O ticket será fechado em 5 segundos.')
        .setColor(0xED4245);

      await interaction.update({ embeds: [embed], components: [] });

      // Marcar ticket como fechado
      const ticketIndex = db.tickets?.findIndex(t => t.channel_id === interaction.channel.id);
      if (ticketIndex > -1) {
        db.tickets[ticketIndex].closed = true;
        saveData(db);
      }

      setTimeout(async () => {
        try {
          await interaction.channel.delete();
        } catch (e) {
          console.error('Erro ao deletar canal:', e);
        }
      }, 5000);
    }

    // ----- TICKET: Fechar -----
    if (customId === 'ticket_close') {
      // Marcar ticket como fechado
      const ticketIndex = db.tickets?.findIndex(t => t.channel_id === interaction.channel.id);
      if (ticketIndex > -1) {
        db.tickets[ticketIndex].closed = true;
        saveData(db);
      }

      await interaction.reply({ content: '🔒 Fechando ticket...' });
      setTimeout(async () => {
        try {
          await interaction.channel.delete();
        } catch (e) {
          console.error('Erro ao deletar canal:', e);
        }
      }, 2000);
    }

    // ==================== BOTÕES DO SISTEMA DE SUPORTE ====================

    // ----- SUPORTE: Abrir Ticket -----
    if (customId === 'support_open_ticket') {
      const modal = new ModalBuilder()
        .setCustomId('modal_support_ticket')
        .setTitle('🎫 Abrir Ticket de Suporte');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('subject')
            .setLabel('Assunto do Ticket')
            .setPlaceholder('Ex: Problema com compra, Dúvida sobre produto...')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Descreva seu problema')
            .setPlaceholder('Descreva detalhadamente o que você precisa de ajuda...')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    // ----- SUPORTE: Assumir Ticket -----
    if (customId === 'support_claim') {
      // Recarregar dados do banco
      db = loadData();

      // Buscar ticket no banco
      const ticket = db.supportTickets?.find(t => t.channel_id === interaction.channel.id);
      if (!ticket) {
        await interaction.reply({ content: '❌ Ticket não encontrado no sistema.', flags: MessageFlags.Ephemeral });
        return;
      }

      // Verificar se é membro do suporte
      if (!hasSupportRole(interaction.member)) {
        await interaction.reply({ 
          content: '❌ Apenas membros da equipe de suporte podem assumir tickets!', 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }

      if (ticket.claimed_by) {
        await interaction.reply({ 
          content: `❌ Este ticket já foi assumido por <@${ticket.claimed_by}>!`, 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }

      // Atualizar ticket
      ticket.claimed_by = interaction.user.id;
      saveData(db);

      // Atualizar embed
      const embed = new EmbedBuilder()
        .setTitle(`🎫 Ticket de Suporte #${ticket.id}`)
        .setDescription(`Ticket assumido por ${interaction.user}!\n\nDescreva seu problema detalhadamente.`)
        .setColor(0x57F287)
        .addFields(
          { name: '👤 Aberto por', value: `<@${ticket.user_id}>`, inline: true },
          { name: '📋 Assunto', value: ticket.subject || 'Não especificado', inline: true },
          { name: '📅 Data', value: `<t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:F>`, inline: true },
          { name: '🔓 Status', value: '`Em Atendimento`', inline: true },
          { name: '👨‍💼 Atendente', value: `${interaction.user}`, inline: true }
        )
        .setFooter({ text: '🏪 INFINITY VENDAS • Suporte' })
        .setTimestamp();

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('support_claim')
            .setLabel('👋 Assumir Ticket')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('support_call')
            .setLabel('📢 Chamar Suporte')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('support_close')
            .setLabel('🔒 Fechar Ticket')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.update({ embeds: [embed], components: [buttons] });
      await interaction.channel.send({ content: `✅ ${interaction.user} assumiu este ticket!` });
      return;
    }

    // ----- SUPORTE: Chamar Suporte -----
    if (customId === 'support_call') {
      // Recarregar dados do banco
      db = loadData();

      // Buscar ticket no banco
      const ticket = db.supportTickets?.find(t => t.channel_id === interaction.channel.id);
      if (!ticket) {
        await interaction.reply({ content: '❌ Ticket não encontrado no sistema.', flags: MessageFlags.Ephemeral });
        return;
      }

      // Apenas quem abriu pode chamar suporte
      if (interaction.user.id !== ticket.user_id) {
        await interaction.reply({ 
          content: '❌ Apenas quem abriu o ticket pode usar este botão!', 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }

      await interaction.reply({ 
        content: `📢 **Chamando suporte!**\n${SUPPORT_ROLES.map(r => `<@&${r}>`).join(' ')}\n\n<@${ticket.user_id}> está solicitando ajuda!` 
      });
      return;
    }

    // ----- SUPORTE: Fechar Ticket -----
    if (customId === 'support_close') {
      // Recarregar dados do banco
      db = loadData();

      // Buscar ticket no banco
      const ticket = db.supportTickets?.find(t => t.channel_id === interaction.channel.id);
      if (!ticket) {
        await interaction.reply({ content: '❌ Ticket não encontrado no sistema.', flags: MessageFlags.Ephemeral });
        return;
      }

      // Apenas suporte pode fechar
      if (!hasSupportRole(interaction.member)) {
        await interaction.reply({ 
          content: '❌ Apenas membros da equipe de suporte podem fechar tickets!', 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }

      // Embed de confirmação
      const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Confirmar Fechamento')
        .setDescription('Tem certeza que deseja fechar este ticket?\nEsta ação não pode ser desfeita.')
        .setColor(0xED4245);

      const confirmRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('support_close_confirm')
            .setLabel('✅ Confirmar')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('support_close_cancel')
            .setLabel('❌ Cancelar')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow] });
      return;
    }

    // ----- SUPORTE: Confirmar Fechamento -----
    if (customId === 'support_close_confirm') {
      // Verificar permissão
      if (!hasSupportRole(interaction.member)) {
        await interaction.reply({ 
          content: '❌ Apenas membros da equipe de suporte podem fechar tickets!', 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }

      // Recarregar dados do banco
      db = loadData();

      // Buscar e atualizar ticket
      const ticketIndex = db.supportTickets?.findIndex(t => t.channel_id === interaction.channel.id);
      if (ticketIndex > -1) {
        db.supportTickets[ticketIndex].closed = true;
        db.supportTickets[ticketIndex].closed_at = new Date().toISOString();
        db.supportTickets[ticketIndex].closed_by = interaction.user.id;
        saveData(db);
      }

      const ticket = db.supportTickets[ticketIndex];

      // Log de fechamento
      if (db.config?.logs_channel) {
        try {
          const logsChannel = await client.channels.fetch(db.config.logs_channel);
          const logEmbed = new EmbedBuilder()
            .setTitle('🔒 Ticket de Suporte Fechado')
            .setColor(0xED4245)
            .addFields(
              { name: '🎫 Ticket', value: `#${ticket?.id || 'N/A'}`, inline: true },
              { name: '👤 Aberto por', value: `<@${ticket?.user_id}>`, inline: true },
              { name: '👨‍💼 Fechado por', value: `${interaction.user}`, inline: true },
              { name: '📋 Assunto', value: ticket?.subject || 'N/A', inline: false }
            )
            .setTimestamp();

          await logsChannel.send({ embeds: [logEmbed] });
        } catch (e) {
          console.error('Erro ao enviar log:', e);
        }
      }

      const closedEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Fechado')
        .setDescription(`Este ticket foi fechado por ${interaction.user}.\nO canal será deletado em 5 segundos.`)
        .setColor(0xED4245)
        .setTimestamp();

      await interaction.update({ embeds: [closedEmbed], components: [] });

      setTimeout(async () => {
        try {
          await interaction.channel.delete();
        } catch (e) {
          console.error('Erro ao deletar canal do ticket:', e);
        }
      }, 5000);
      return;
    }

    // ----- SUPORTE: Cancelar Fechamento -----
    if (customId === 'support_close_cancel') {
      await interaction.update({ content: '❌ Fechamento cancelado.', embeds: [], components: [] });
      return;
    }

    // ----- Confirmar Delete -----
    if (customId.startsWith('confirm_delete_')) {
      const productId = customId.split('_')[2];
      const product = getProductById(productId);
      
      if (product) {
        // Tentar deletar mensagem do canal
        if (product.channel_id && product.message_id) {
          try {
            const channel = await client.channels.fetch(product.channel_id);
            const msg = await channel.messages.fetch(product.message_id);
            await msg.delete();
          } catch (e) {
            console.error('Erro ao deletar mensagem:', e);
          }
        }
        
        deleteProduct(productId);
        await interaction.update({ content: `✅ Produto **${product.name}** removido!`, embeds: [], components: [] });
      }
    }

    // ----- Cancelar Ação -----
    if (customId === 'cancel_action') {
      await interaction.update({ content: '❌ Ação cancelada.', embeds: [], components: [] });
    }
  }

  // ========== SELECT MENUS ==========
  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;
    const value = interaction.values[0];

    // ----- Selecionar para Editar -----
    if (customId === 'select_edit') {
      const productId = value.split('_')[1];
      const product = getProductById(productId);
      if (!product) return interaction.reply({ content: '❌ Produto não encontrado!', flags: MessageFlags.Ephemeral });

      const modal = new ModalBuilder()
        .setCustomId(`modal_edit_${productId}`)
        .setTitle(`✏️ Editar: ${product.name.slice(0, 30)}`);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Nome')
            .setStyle(TextInputStyle.Short)
            .setValue(product.name)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('price')
            .setLabel('Preço')
            .setStyle(TextInputStyle.Short)
            .setValue(product.price.toString())
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Descrição')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(product.description || '')
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('stock')
            .setLabel('Estoque')
            .setStyle(TextInputStyle.Short)
            .setValue(product.stock.toString())
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('image')
            .setLabel('URL da Imagem')
            .setStyle(TextInputStyle.Short)
            .setValue(product.image_url || '')
            .setRequired(false)
        )
      );

      await interaction.showModal(modal);
    }

    // ----- Selecionar para Deletar -----
    if (customId === 'select_delete') {
      const productId = value.split('_')[1];
      const product = getProductById(productId);
      if (!product) return interaction.reply({ content: '❌ Produto não encontrado!', flags: MessageFlags.Ephemeral });

      const embed = new EmbedBuilder()
        .setTitle('⚠️ Confirmar Exclusão')
        .setDescription(`Deseja remover **${product.name}**?`)
        .setColor(0xED4245);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_delete_${productId}`)
          .setLabel('🗑️ Confirmar')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_action')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.update({ content: '', embeds: [embed], components: [row] });
    }

    // ----- Selecionar para Enviar -----
    if (customId === 'select_send') {
      const productId = value.split('_')[1];
      const product = getProductById(productId);
      if (!product) return interaction.reply({ content: '❌ Produto não encontrado!', flags: MessageFlags.Ephemeral });

      // Listar canais de texto
      const channels = interaction.guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText)
        .map(c => ({ label: `#${c.name}`.slice(0, 100), value: c.id }))
        .slice(0, 25);

      if (channels.length === 0) {
        return interaction.reply({ content: '❌ Nenhum canal de texto encontrado.', flags: MessageFlags.Ephemeral });
      }

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`channel_send_${productId}`)
          .setPlaceholder('Selecione o canal')
          .addOptions(channels)
      );

      await interaction.update({ content: `📢 Selecione o canal para enviar **${product.name}**:`, components: [row] });
    }

    // ----- Selecionar Canal para Enviar -----
    if (customId.startsWith('channel_send_')) {
      const productId = customId.split('_')[2];
      const channelId = value;
      const product = getProductById(productId);

      if (!product) {
        return interaction.reply({ content: '❌ Produto não encontrado!', flags: MessageFlags.Ephemeral });
      }

      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return interaction.reply({ content: '❌ Canal não encontrado!', flags: MessageFlags.Ephemeral });
      }

      const message = await sendProductToChannel(product, channel);
      if (message) {
        await interaction.update({ content: `✅ Produto **${product.name}** enviado em ${channel}!`, components: [] });
      } else {
        await interaction.reply({ content: '❌ Erro ao enviar produto.', flags: MessageFlags.Ephemeral });
      }
    }

    // ----- Selecionar para Alterar Estoque -----
    if (customId === 'select_stock') {
      const productId = value.split('_')[1];
      const product = getProductById(productId);
      if (!product) return interaction.reply({ content: '❌ Produto não encontrado!', flags: MessageFlags.Ephemeral });

      const modal = new ModalBuilder()
        .setCustomId(`modal_stock_${productId}`)
        .setTitle(`📦 Estoque: ${product.name.slice(0, 30)}`);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('stock')
            .setLabel('Nova Quantidade')
            .setStyle(TextInputStyle.Short)
            .setValue(product.stock.toString())
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
    }
  }

  // ========== MODAIS ==========
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;

    // ----- Modal: Adicionar Produto -----
    if (customId === 'modal_add_product') {
      const name = interaction.fields.getTextInputValue('name');
      const price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.')) || 0;
      const description = interaction.fields.getTextInputValue('description') || '';
      const stock = parseInt(interaction.fields.getTextInputValue('stock')) || 0;
      const image = interaction.fields.getTextInputValue('image') || '';

      const product = createProduct({ name, price, description, stock, image_url: image });

      const embed = new EmbedBuilder()
        .setTitle('✅ Produto Adicionado!')
        .setColor(0x57F287)
        .addFields(
          { name: '📦 Nome', value: product.name, inline: true },
          { name: '💰 Preço', value: `R$ ${product.price.toFixed(2)}`, inline: true },
          { name: '🆔 ID', value: `${product.id}`, inline: true }
        );

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ----- Modal: Editar Produto -----
    if (customId.startsWith('modal_edit_')) {
      const productId = customId.split('_')[2];
      const name = interaction.fields.getTextInputValue('name');
      const price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.')) || 0;
      const description = interaction.fields.getTextInputValue('description') || '';
      const stock = parseInt(interaction.fields.getTextInputValue('stock')) || 0;
      const image = interaction.fields.getTextInputValue('image') || '';

      const updated = updateProduct(productId, { name, price, description, stock, image_url: image });
      if (updated) {
        await updateProductMessage(updated);
      }

      await interaction.reply({ content: `✅ Produto **${name}** atualizado!`, flags: MessageFlags.Ephemeral });
    }

    // ----- Modal: Alterar Estoque -----
    if (customId.startsWith('modal_stock_')) {
      const productId = customId.split('_')[2];
      const stock = parseInt(interaction.fields.getTextInputValue('stock')) || 0;

      const updated = updateProduct(productId, { stock });
      if (updated) {
        await updateProductMessage(updated);
      }

      await interaction.reply({ content: `✅ Estoque atualizado para **${stock}** unidades!`, flags: MessageFlags.Ephemeral });
    }

    // ----- Modal: Canal de Logs -----
    if (customId === 'modal_logs') {
      const channelId = interaction.fields.getTextInputValue('channel_id').trim();
      
      if (!db.config) db.config = {};
      db.config.logs_channel = channelId;
      saveData(db);

      await interaction.reply({ content: `✅ Canal de logs definido para <#${channelId}>!`, flags: MessageFlags.Ephemeral });
    }

    // ----- Modal: Ticket de Suporte -----
    if (customId === 'modal_support_ticket') {
      const subject = interaction.fields.getTextInputValue('subject');
      const description = interaction.fields.getTextInputValue('description');

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const result = await createSupportTicket(interaction.guild, interaction.user, subject);

      if (result.error === 'already_open') {
        return interaction.editReply({ 
          content: `❌ Você já possui um ticket aberto! Acesse <#${result.channel_id}>` 
        });
      }

      if (result.error === 'create_failed') {
        return interaction.editReply({ content: '❌ Erro ao criar ticket. Tente novamente.' });
      }

      // Enviar mensagem inicial com a descrição do problema
      const descEmbed = new EmbedBuilder()
        .setTitle('📝 Descrição do Problema')
        .setDescription(description)
        .setColor(0x5865F2)
        .setFooter({ text: `Enviado por ${interaction.user.username}` })
        .setTimestamp();

      await result.channel.send({ embeds: [descEmbed] });

      await interaction.editReply({ 
        content: `✅ Ticket #${result.ticketNumber} criado com sucesso!\nAcesse: ${result.channel}` 
      });
    }
  }

  } catch (error) {
    console.error('Erro no handler de interação:', error);
    // Tentar responder apenas se ainda não respondeu
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Ocorreu um erro ao processar sua solicitação.', flags: MessageFlags.Ephemeral });
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: '❌ Ocorreu um erro ao processar sua solicitação.' });
      }
    } catch (e) {
      // Ignorar se não conseguir responder (interação já expirou)
    }
  }
});

// ==================== LOGIN ====================
client.login(process.env.DISCORD_TOKEN);
