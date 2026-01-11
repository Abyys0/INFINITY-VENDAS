# 🛒 INFINITY VENDAS - Bot Discord

Bot de vendas para Discord com gerenciamento completo via comandos slash.

## ✨ Funcionalidades

- 📦 **Gerenciamento de Produtos** - Adicione, edite e remova produtos via comandos
- 📢 **Envio em Canais** - Envie produtos com embeds bonitos em qualquer canal
- 🛒 **Sistema de Compras** - Botões interativos para comprar produtos
- 📝 **Logs de Compras** - Receba notificações de cada compra realizada
- 📊 **Controle de Estoque** - Estoque atualizado automaticamente

## 🎮 Comandos

### Administrador
| Comando | Descrição |
|---------|-----------|
| `/produto adicionar` | Adicionar novo produto |
| `/produto listar` | Ver todos os produtos |
| `/produto editar` | Editar um produto |
| `/produto remover` | Remover um produto |
| `/produto enviar` | Enviar produto em um canal |
| `/produto estoque` | Alterar estoque |
| `/config logs` | Definir canal de logs |

### Usuários
| Comando | Descrição |
|---------|-----------|
| `/loja` | Ver produtos disponíveis |

## 🚀 Deploy no Render

### 1. Faça push do código para o GitHub
```bash
git add .
git commit -m "Bot INFINITY VENDAS"
git push origin main
```

### 2. Configure no Render
1. Acesse [render.com](https://render.com)
2. Crie um **Background Worker**
3. Conecte seu repositório GitHub
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Adicione variável de ambiente:
   - `DISCORD_TOKEN` = seu token do bot

## 📁 Estrutura

```
INFINITY-VENDAS/
├── src/
│   └── bot.js          # Bot principal
├── data.json           # Banco de dados
├── package.json
├── .env
└── README.md
```

## 🔧 Configuração Local

1. Clone o repositório
2. Crie o arquivo `.env`:
```env
DISCORD_TOKEN=seu_token_aqui
```
3. Instale e inicie:
```bash
npm install
npm start
```

## 📝 Licença

MIT License - Feito com ❤️ por INFINITY