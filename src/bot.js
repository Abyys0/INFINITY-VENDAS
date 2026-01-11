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
  ChannelType
} = require('discord.js');
const fs = require('fs');
const path = require('path');

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
  return { products: [], nextId: 1, config: {} };
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
    GatewayIntentBits.MessageContent
  ]
});

// ==================== COMANDOS SLASH ====================
const commands = [
  new SlashCommandBuilder()
    .setName('produto')
    .setDescription('Gerenciar produtos da loja')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('adicionar')
        .setDescription('Adicionar um novo produto')
        .addStringOption(opt => opt.setName('nome').setDescription('Nome do produto').setRequired(true))
        .addNumberOption(opt => opt.setName('preco').setDescription('Preço do produto').setRequired(true))
        .addStringOption(opt => opt.setName('descricao').setDescription('Descrição do produto'))
        .addIntegerOption(opt => opt.setName('estoque').setDescription('Quantidade em estoque'))
        .addStringOption(opt => opt.setName('categoria').setDescription('Categoria do produto'))
        .addStringOption(opt => opt.setName('imagem').setDescription('URL da imagem'))
        .addChannelOption(opt => opt.setName('canal').setDescription('Canal para enviar o produto'))
    )
    .addSubcommand(sub =>
      sub.setName('listar')
        .setDescription('Listar todos os produtos')
    )
    .addSubcommand(sub =>
      sub.setName('editar')
        .setDescription('Editar um produto')
        .addIntegerOption(opt => opt.setName('id').setDescription('ID do produto').setRequired(true))
        .addStringOption(opt => opt.setName('nome').setDescription('Novo nome'))
        .addNumberOption(opt => opt.setName('preco').setDescription('Novo preço'))
        .addStringOption(opt => opt.setName('descricao').setDescription('Nova descrição'))
        .addIntegerOption(opt => opt.setName('estoque').setDescription('Novo estoque'))
        .addStringOption(opt => opt.setName('categoria').setDescription('Nova categoria'))
        .addStringOption(opt => opt.setName('imagem').setDescription('Nova URL da imagem'))
    )
    .addSubcommand(sub =>
      sub.setName('remover')
        .setDescription('Remover um produto')
        .addIntegerOption(opt => opt.setName('id').setDescription('ID do produto').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('enviar')
        .setDescription('Enviar produto em um canal')
        .addIntegerOption(opt => opt.setName('id').setDescription('ID do produto').setRequired(true))
        .addChannelOption(opt => opt.setName('canal').setDescription('Canal para enviar').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('estoque')
        .setDescription('Alterar estoque de um produto')
        .addIntegerOption(opt => opt.setName('id').setDescription('ID do produto').setRequired(true))
        .addIntegerOption(opt => opt.setName('quantidade').setDescription('Nova quantidade').setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName('loja')
    .setDescription('Ver a loja')
    .addStringOption(opt => opt.setName('categoria').setDescription('Filtrar por categoria')),

  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurações do bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('logs')
        .setDescription('Definir canal de logs de compras')
        .addChannelOption(opt => opt.setName('canal').setDescription('Canal de logs').setRequired(true))
    )
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
  const row = new ActionRowBuilder()
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
  return row;
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
    if (!product.channel_id || !product.message_id) return false;
    
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

// ==================== DELETAR MENSAGEM DO PRODUTO ====================
async function deleteProductMessage(product) {
  try {
    if (!product.channel_id || !product.message_id) return false;
    
    const channel = await client.channels.fetch(product.channel_id);
    if (!channel) return false;

    const message = await channel.messages.fetch(product.message_id).catch(() => null);
    if (message) await message.delete();
    
    return true;
  } catch (error) {
    console.error('Erro ao deletar mensagem:', error);
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
  
  // Registrar comandos
  try {
    await client.application.commands.set(commands);
    console.log('✅ Comandos slash registrados!');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }
  
  client.user.setPresence({
    activities: [{ name: '🛒 /loja • INFINITY', type: 3 }],
    status: 'online'
  });
});

// ==================== HANDLER DE INTERAÇÕES ====================
client.on('interactionCreate', async (interaction) => {
  
  // ========== COMANDOS SLASH ==========
  if (interaction.isChatInputCommand()) {
    const { commandName, options } = interaction;

    // ---------- /produto ----------
    if (commandName === 'produto') {
      const sub = options.getSubcommand();

      // Adicionar produto
      if (sub === 'adicionar') {
        const nome = options.getString('nome');
        const preco = options.getNumber('preco');
        const descricao = options.getString('descricao') || '';
        const estoque = options.getInteger('estoque') || 0;
        const categoria = options.getString('categoria') || 'Geral';
        const imagem = options.getString('imagem') || '';
        const canal = options.getChannel('canal');

        const product = createProduct({
          name: nome,
          price: preco,
          description: descricao,
          stock: estoque,
          category: categoria,
          image_url: imagem
        });

        const embed = new EmbedBuilder()
          .setTitle('✅ Produto Adicionado!')
          .setColor(0x57F287)
          .addFields(
            { name: '📦 Produto', value: product.name, inline: true },
            { name: '💰 Preço', value: `R$ ${product.price.toFixed(2)}`, inline: true },
            { name: '🆔 ID', value: `${product.id}`, inline: true }
          );

        await interaction.reply({ embeds: [embed], ephemeral: true });

        // Enviar no canal se especificado
        if (canal) {
          await sendProductToChannel(product, canal);
          await interaction.followUp({ 
            content: `📢 Produto enviado em ${canal}!`, 
            ephemeral: true 
          });
        }
      }

      // Listar produtos
      if (sub === 'listar') {
        const products = getAllProducts();
        
        if (products.length === 0) {
          return interaction.reply({ 
            content: '📭 Nenhum produto cadastrado ainda.\nUse `/produto adicionar` para adicionar produtos.', 
            ephemeral: true 
          });
        }

        const embed = new EmbedBuilder()
          .setTitle('📋 Lista de Produtos')
          .setColor(0x5865F2)
          .setDescription(products.map(p => 
            `**#${p.id}** • ${p.name}\n└ 💰 R$ ${p.price.toFixed(2)} • 📦 ${p.stock} un • 📁 ${p.category}`
          ).join('\n\n'))
          .setFooter({ text: `Total: ${products.length} produtos` });

        await interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Editar produto
      if (sub === 'editar') {
        const id = options.getInteger('id');
        const product = getProductById(id);

        if (!product) {
          return interaction.reply({ content: '❌ Produto não encontrado!', ephemeral: true });
        }

        const updates = {};
        if (options.getString('nome')) updates.name = options.getString('nome');
        if (options.getNumber('preco')) updates.price = options.getNumber('preco');
        if (options.getString('descricao')) updates.description = options.getString('descricao');
        if (options.getInteger('estoque') !== null) updates.stock = options.getInteger('estoque');
        if (options.getString('categoria')) updates.category = options.getString('categoria');
        if (options.getString('imagem')) updates.image_url = options.getString('imagem');

        const updated = updateProduct(id, updates);
        await updateProductMessage(updated);

        const embed = new EmbedBuilder()
          .setTitle('✏️ Produto Atualizado!')
          .setColor(0xFFA500)
          .setDescription(`**${updated.name}** foi atualizado com sucesso.`);

        await interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Remover produto
      if (sub === 'remover') {
        const id = options.getInteger('id');
        const product = getProductById(id);

        if (!product) {
          return interaction.reply({ content: '❌ Produto não encontrado!', ephemeral: true });
        }

        await deleteProductMessage(product);
        deleteProduct(id);

        await interaction.reply({ 
          content: `🗑️ Produto **${product.name}** removido com sucesso!`, 
          ephemeral: true 
        });
      }

      // Enviar produto
      if (sub === 'enviar') {
        const id = options.getInteger('id');
        const canal = options.getChannel('canal');
        const product = getProductById(id);

        if (!product) {
          return interaction.reply({ content: '❌ Produto não encontrado!', ephemeral: true });
        }

        await sendProductToChannel(product, canal);
        await interaction.reply({ 
          content: `📢 Produto **${product.name}** enviado em ${canal}!`, 
          ephemeral: true 
        });
      }

      // Alterar estoque
      if (sub === 'estoque') {
        const id = options.getInteger('id');
        const quantidade = options.getInteger('quantidade');
        const product = getProductById(id);

        if (!product) {
          return interaction.reply({ content: '❌ Produto não encontrado!', ephemeral: true });
        }

        const updated = updateProduct(id, { stock: quantidade });
        await updateProductMessage(updated);

        await interaction.reply({ 
          content: `📦 Estoque de **${product.name}** atualizado para **${quantidade}** unidades!`, 
          ephemeral: true 
        });
      }
    }

    // ---------- /loja ----------
    if (commandName === 'loja') {
      const categoria = options.getString('categoria');
      let products = getAllProducts().filter(p => p.stock > 0);
      
      if (categoria) {
        products = products.filter(p => 
          p.category.toLowerCase().includes(categoria.toLowerCase())
        );
      }

      if (products.length === 0) {
        return interaction.reply({ 
          content: '📭 Nenhum produto disponível no momento.', 
          ephemeral: true 
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('🏪 INFINITY VENDAS')
        .setDescription('Confira nossos produtos disponíveis!')
        .setColor(0x5865F2)
        .addFields(
          products.slice(0, 10).map(p => ({
            name: `${p.name}`,
            value: `💰 **R$ ${p.price.toFixed(2)}** • 📦 ${p.stock} un\n\`/produto enviar id:${p.id}\``,
            inline: true
          }))
        )
        .setFooter({ text: `${products.length} produtos disponíveis • INFINITY VENDAS` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

    // ---------- /config ----------
    if (commandName === 'config') {
      const sub = options.getSubcommand();
      const canal = options.getChannel('canal');

      if (!db.config) db.config = {};
      
      if (sub === 'logs') {
        db.config.logs_channel = canal.id;
        saveData(db);
        await interaction.reply({ 
          content: `✅ Canal de logs definido para ${canal}!`, 
          ephemeral: true 
        });
      }
    }
  }

  // ========== BOTÕES ==========
  if (interaction.isButton()) {
    const [action, productId] = interaction.customId.split('_');
    const product = getProductById(productId);

    if (!product) {
      return interaction.reply({ content: '❌ Produto não encontrado!', ephemeral: true });
    }

    if (action === 'buy') {
      if (product.stock <= 0) {
        return interaction.reply({ content: '❌ Produto esgotado!', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🛒 Finalizar Compra')
        .setDescription(`Você está comprando: **${product.name}**`)
        .setColor(0x57F287)
        .addFields(
          { name: '💰 Valor', value: `R$ ${product.price.toFixed(2)}`, inline: true },
          { name: '📦 Disponível', value: `${product.stock} un`, inline: true }
        )
        .setFooter({ text: 'Clique em confirmar para finalizar a compra' });

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_${product.id}`)
            .setLabel('✅ Confirmar Compra')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`cancel_${product.id}`)
            .setLabel('❌ Cancelar')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
    }

    if (action === 'confirm') {
      if (product.stock <= 0) {
        return interaction.reply({ content: '❌ Produto esgotado!', ephemeral: true });
      }

      // Diminuir estoque
      const updated = updateProduct(product.id, { stock: product.stock - 1 });
      await updateProductMessage(updated);

      const embed = new EmbedBuilder()
        .setTitle('✅ Compra Realizada!')
        .setDescription(`Você comprou: **${product.name}**`)
        .setColor(0x57F287)
        .addFields(
          { name: '💰 Valor Pago', value: `R$ ${product.price.toFixed(2)}`, inline: true }
        )
        .setFooter({ text: 'Aguarde um administrador entrar em contato!' })
        .setTimestamp();

      await interaction.update({ embeds: [embed], components: [] });

      // Log de compra
      if (db.config?.logs_channel) {
        try {
          const logsChannel = await client.channels.fetch(db.config.logs_channel);
          const logEmbed = new EmbedBuilder()
            .setTitle('📝 Nova Compra!')
            .setColor(0x57F287)
            .addFields(
              { name: '👤 Comprador', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
              { name: '📦 Produto', value: product.name, inline: true },
              { name: '💰 Valor', value: `R$ ${product.price.toFixed(2)}`, inline: true },
              { name: '🆔 ID Produto', value: `${product.id}`, inline: true }
            )
            .setTimestamp();
          
          await logsChannel.send({ embeds: [logEmbed] });
        } catch (error) {
          console.error('Erro ao enviar log:', error);
        }
      }
    }

    if (action === 'cancel') {
      await interaction.update({ 
        content: '❌ Compra cancelada.', 
        embeds: [], 
        components: [] 
      });
    }

    if (action === 'info') {
      const embed = new EmbedBuilder()
        .setTitle(`📋 ${product.name}`)
        .setDescription(product.description || '*Sem descrição detalhada*')
        .setColor(0x5865F2)
        .addFields(
          { name: '💰 Preço', value: `R$ ${product.price.toFixed(2)}`, inline: true },
          { name: '📦 Estoque', value: `${product.stock} unidades`, inline: true },
          { name: '📁 Categoria', value: product.category || 'Geral', inline: true },
          { name: '🆔 ID', value: `${product.id}`, inline: true }
        )
        .setTimestamp();

      if (product.image_url) {
        embed.setThumbnail(product.image_url);
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
});

// ==================== LOGIN ====================
client.login(process.env.DISCORD_TOKEN);
