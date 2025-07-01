# Donor Rewards Discord Bot

A Discord bot that tracks cryptocurrency donations via tip.cc, assigns donor roles based on donation amounts, and manages donation draws for rewards.

## Features

- **Donation Tracking**: Automatically detects and tracks cryptocurrency donations made through tip.cc
- **Donor Roles**: Assigns roles based on total donation amounts
- **Donation Draws**: Creates and manages draws with customizable entry requirements
- **Multiple Cryptocurrencies**: Supports a wide range of cryptocurrencies with real-time price conversion
- **Achievement System**: Awards achievements to donors based on their donation history
- **Analytics Dashboard**: Provides detailed analytics on donations and draws
- **Privacy Controls**: Allows users to remain anonymous in leaderboards and announcements
- **Customizable Themes**: Customize the appearance of embeds and messages
- **Backup System**: Automatically creates backups of the database

## Setup

### Prerequisites

- Node.js 16.x or higher
- A Discord bot token (create one at [Discord Developer Portal](https://discord.com/developers/applications))
- A server where the bot will run (VPS, dedicated server, etc.)

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/donor-rewards-bot.git
   cd donor-rewards-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   BOT_TOKEN=your_discord_bot_token
   OWNER_ID=your_discord_user_id
   SERVER_IDS=server_id_1,server_id_2
   LOG_LEVEL=INFO
   COINMARKETCAP_API_KEY=your_coinmarketcap_api_key (optional)
   COINGECKO_PRO_API_KEY=your_coingecko_pro_api_key (optional)
   ```

4. Start the bot:
   ```bash
   npm start
   ```

### Running with PM2 (Recommended for Production)

1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```

2. Start the bot with PM2:
   ```bash
   pm2 start index.js --name donor-rewards-bot
   ```

3. Set PM2 to start on system boot:
   ```bash
   pm2 startup
   pm2 save
   ```

## Bot Setup in Discord

1. Invite the bot to your server with the following permissions:
   - Manage Roles
   - Read Messages/View Channels
   - Send Messages
   - Embed Links
   - Attach Files
   - Read Message History

2. Use the `/setup` command to configure the bot:
   ```
   /setup admin_role:@Admin notification_channel:#announcements
   ```

3. Add allowed donation recipients:
   ```
   /admin add_recipient recipient:@ProjectWallet
   ```

4. Create your first draw:
   ```
   /admin create_draw id:monthly name:"Monthly Draw" min_amount:10 max_amount:100 reward:"50 USDT" max_entries:100
   ```

## Usage

### Admin Commands

- `/admin setup` - Initial bot setup
- `/admin dashboard` - View admin dashboard
- `/admin create_draw` - Create a new donation draw
- `/admin select_winner` - Select a winner from a draw
- `/admin assign_entries` - Manually assign entries to users
- `/admin add_recipient` - Add a donation recipient
- `/admin features` - Toggle bot features

### User Commands

- `/donate` - Get donation instructions
- `/entries` - Check your draw entries
- `/draws list` - View available draws
- `/user profile` - View your donor profile
- `/user privacy` - Toggle privacy settings

## Cryptocurrency Price API

The bot uses multiple APIs to get cryptocurrency prices:

1. CoinGecko (default, no API key required)
2. CoinMarketCap (requires API key)

For more accurate pricing, it's recommended to get a free API key from CoinMarketCap and add it to your `.env` file.

## Customization

### Accepted Cryptocurrencies

Edit the `DEFAULT_ACCEPTED_CRYPTOCURRENCIES` array in `config.js` to add or remove accepted cryptocurrencies.

### Donor Roles

Edit the `DONOR_ROLES` object in `config.js` to customize the donor roles and their requirements.

### Draw Categories

Edit the `DRAW_CATEGORIES` object in `config.js` to customize the available draw categories.

## Troubleshooting

### Bot Not Detecting Donations

1. Make sure the tip.cc bot is in your server
2. Verify that you've added the correct recipient(s) using `/admin add_recipient`
3. Check that the cryptocurrency being donated is in the accepted list
4. Ensure the bot has permission to read messages in the channel where donations are made

### Commands Not Working

1. Make sure the bot has the necessary permissions
2. Check that you have the admin role assigned by `/setup`
3. Verify that the bot is online and responding to other commands

## Support

If you need help with the bot, please open an issue on GitHub or contact the developer on Discord.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
