require('dotenv').config();
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
  PermissionsBitField
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ==================== CONFIGURAÇÕES ====================
const GUILD_ID = process.env.GUILD_ID;
const ADMIN_ROLES = process.env.ADMIN_ROLES?.split(',') || [];

// ==================== BANCO DE DADOS JSON ====================
const DATA_FILE = path.join(__dirname, '..', 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
  }
  return { products: [], nextId: 1, config: {}, tickets: [] };
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
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ==================== COMANDO SLASH ====================
const commands = [
  new SlashCommandBuilder()
    .setName('painelvendas')
    .setDescription('Abrir painel de gerenciamento da loja')
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
client.once('ready', async () => {
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
    await client.application.commands.set(commands);
    console.log('✅ Comando /painelvendas registrado!');
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

  // ========== COMANDO /painelvendas ==========
  if (interaction.isChatInputCommand() && interaction.commandName === 'painelvendas') {
    const panel = createAdminPanel();
    await interaction.reply({ embeds: [panel.embed], components: panel.components, ephemeral: true });
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
          ephemeral: true 
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Lista de Produtos')
        .setColor(0x5865F2)
        .setDescription(products.map(p => 
          `**#${p.id}** • ${p.name}\n└ 💰 R$ ${p.price.toFixed(2)} • 📦 ${p.stock} un`
        ).join('\n\n'))
        .setFooter({ text: `Total: ${products.length} produtos` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ----- PAINEL ADMIN: Editar Produto -----
    if (customId === 'admin_edit') {
      const products = getAllProducts();
      if (products.length === 0) {
        return interaction.reply({ content: '📭 Nenhum produto para editar.', ephemeral: true });
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

      await interaction.reply({ content: '✏️ Selecione o produto que deseja editar:', components: [row], ephemeral: true });
    }

    // ----- PAINEL ADMIN: Remover Produto -----
    if (customId === 'admin_delete') {
      const products = getAllProducts();
      if (products.length === 0) {
        return interaction.reply({ content: '📭 Nenhum produto para remover.', ephemeral: true });
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

      await interaction.reply({ content: '🗑️ Selecione o produto que deseja remover:', components: [row], ephemeral: true });
    }

    // ----- PAINEL ADMIN: Enviar no Canal -----
    if (customId === 'admin_send') {
      const products = getAllProducts();
      if (products.length === 0) {
        return interaction.reply({ content: '📭 Nenhum produto para enviar.', ephemeral: true });
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

      await interaction.reply({ content: '📢 Selecione o produto para enviar no canal:', components: [row], ephemeral: true });
    }

    // ----- PAINEL ADMIN: Alterar Estoque -----
    if (customId === 'admin_stock') {
      const products = getAllProducts();
      if (products.length === 0) {
        return interaction.reply({ content: '📭 Nenhum produto cadastrado.', ephemeral: true });
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

      await interaction.reply({ content: '📦 Selecione o produto para alterar estoque:', components: [row], ephemeral: true });
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
        return interaction.reply({ content: '🎫 Nenhum ticket aberto no momento.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🎫 Tickets Abertos')
        .setColor(0x5865F2)
        .setDescription(openTickets.map(t => 
          `<#${t.channel_id}> • Produto #${t.product_id} • <@${t.user_id}>`
        ).join('\n'));

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ----- COMPRAR PRODUTO -----
    if (customId.startsWith('buy_')) {
      const productId = customId.split('_')[1];
      const product = getProductById(productId);

      if (!product) {
        return interaction.reply({ content: '❌ Produto não encontrado!', ephemeral: true });
      }

      if (product.stock <= 0) {
        return interaction.reply({ content: '❌ Produto esgotado!', ephemeral: true });
      }

      // Criar ticket
      const ticket = await createTicket(interaction.guild, interaction.user, product);
      
      if (ticket) {
        await interaction.reply({ 
          content: `🎫 Ticket criado! Acesse ${ticket} para finalizar sua compra.`, 
          ephemeral: true 
        });
      } else {
        await interaction.reply({ content: '❌ Erro ao criar ticket.', ephemeral: true });
      }
    }

    // ----- INFO PRODUTO -----
    if (customId.startsWith('info_')) {
      const productId = customId.split('_')[1];
      const product = getProductById(productId);

      if (!product) {
        return interaction.reply({ content: '❌ Produto não encontrado!', ephemeral: true });
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

      await interaction.reply({ embeds: [embed], ephemeral: true });
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
      if (!product) return interaction.reply({ content: '❌ Produto não encontrado!', ephemeral: true });

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
      if (!product) return interaction.reply({ content: '❌ Produto não encontrado!', ephemeral: true });

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
      if (!product) return interaction.reply({ content: '❌ Produto não encontrado!', ephemeral: true });

      // Listar canais de texto
      const channels = interaction.guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText)
        .map(c => ({ label: `#${c.name}`.slice(0, 100), value: c.id }))
        .slice(0, 25);

      if (channels.length === 0) {
        return interaction.reply({ content: '❌ Nenhum canal de texto encontrado.', ephemeral: true });
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
        return interaction.reply({ content: '❌ Produto não encontrado!', ephemeral: true });
      }

      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return interaction.reply({ content: '❌ Canal não encontrado!', ephemeral: true });
      }

      const message = await sendProductToChannel(product, channel);
      if (message) {
        await interaction.update({ content: `✅ Produto **${product.name}** enviado em ${channel}!`, components: [] });
      } else {
        await interaction.reply({ content: '❌ Erro ao enviar produto.', ephemeral: true });
      }
    }

    // ----- Selecionar para Alterar Estoque -----
    if (customId === 'select_stock') {
      const productId = value.split('_')[1];
      const product = getProductById(productId);
      if (!product) return interaction.reply({ content: '❌ Produto não encontrado!', ephemeral: true });

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

      await interaction.reply({ embeds: [embed], ephemeral: true });
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

      await interaction.reply({ content: `✅ Produto **${name}** atualizado!`, ephemeral: true });
    }

    // ----- Modal: Alterar Estoque -----
    if (customId.startsWith('modal_stock_')) {
      const productId = customId.split('_')[2];
      const stock = parseInt(interaction.fields.getTextInputValue('stock')) || 0;

      const updated = updateProduct(productId, { stock });
      if (updated) {
        await updateProductMessage(updated);
      }

      await interaction.reply({ content: `✅ Estoque atualizado para **${stock}** unidades!`, ephemeral: true });
    }

    // ----- Modal: Canal de Logs -----
    if (customId === 'modal_logs') {
      const channelId = interaction.fields.getTextInputValue('channel_id').trim();
      
      if (!db.config) db.config = {};
      db.config.logs_channel = channelId;
      saveData(db);

      await interaction.reply({ content: `✅ Canal de logs definido para <#${channelId}>!`, ephemeral: true });
    }
  }
});

// ==================== LOGIN ====================
client.login(process.env.DISCORD_TOKEN);
