import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { getDatabase, saveDatabase } from '../utils/database.js'
import { logger } from '../utils/logger.js'
import { CONFIG } from '../config.js'

export const data = new SlashCommandBuilder()
  .setName('lucky')
  .setDescription('Manage your lucky numbers')
  .addSubcommand(subcommand =>
    subcommand
      .setName('set')
      .setDescription('Set your lucky numbers (1-100)')
      .addIntegerOption(option =>
        option
          .setName('number1')
          .setDescription('First lucky number (1-100)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100)
      )
      .addIntegerOption(option =>
        option
          .setName('number2')
          .setDescription('Second lucky number (1-100)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(100)
      )
      .addIntegerOption(option =>
        option
          .setName('number3')
          .setDescription('Third lucky number (1-100)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(100)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View your current lucky numbers')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('info')
      .setDescription('Learn about the lucky numbers system')
  )

export async function execute(interaction) {
  try {
    const serverId = interaction.guild.id
    const userId = interaction.user.id
    const db = getDatabase(serverId)

    // Check if lucky numbers are enabled
    if (!db.config?.featureToggles?.luckyNumbers) {
      return await interaction.reply({
        content: "❌ Lucky numbers feature is not enabled on this server.",
        ephemeral: true
      })
    }

    const subcommand = interaction.options.getSubcommand()

    switch (subcommand) {
      case 'set':
        await handleSetNumbers(interaction, db, userId, serverId)
        break
      case 'view':
        await handleViewNumbers(interaction, db, userId)
        break
      case 'info':
        await handleInfo(interaction)
        break
    }
  } catch (error) {
    logger.error('Error in lucky command:', error)
    await interaction.reply({
      content: "❌ An error occurred while processing your request.",
      ephemeral: true
    })
  }
}

async function handleSetNumbers(interaction, db, userId, serverId) {
  const number1 = interaction.options.getInteger('number1')
  const number2 = interaction.options.getInteger('number2')
  const number3 = interaction.options.getInteger('number3')

  // Collect all provided numbers
  const numbers = [number1]
  if (number2 !== null) numbers.push(number2)
  if (number3 !== null) numbers.push(number3)

  // Check for duplicates
  const uniqueNumbers = [...new Set(numbers)]
  if (uniqueNumbers.length !== numbers.length) {
    return await interaction.reply({
      content: "❌ Lucky numbers must be unique!",
      ephemeral: true
    })
  }

  // Initialize user data if needed
  if (!db.users[userId]) {
    db.users[userId] = {
      totalDonated: 0,
      entries: {},
      donations: [],
      achievements: [],
      privacyEnabled: false,
      wins: 0,
      lastDonation: null,
      donationStreak: 0,
      longestStreak: 0,
      luckyNumbers: []
    }
  }

  // Set lucky numbers
  db.users[userId].luckyNumbers = uniqueNumbers
  saveDatabase(serverId, db)

  const embed = new EmbedBuilder()
    .setTitle('🍀 Lucky Numbers Set!')
    .setDescription(`Your lucky numbers have been updated!`)
    .addFields({
      name: '🎲 Your Lucky Numbers',
      value: uniqueNumbers.map(n => `**${n}**`).join(', '),
      inline: false
    })
    .setColor(CONFIG.DEFAULT_THEME.success)
    .setFooter({ text: 'Lucky numbers give bonus entries when they match draw results!' })

  await interaction.reply({ embeds: [embed], ephemeral: true })
  logger.info(`User ${userId} set lucky numbers: ${uniqueNumbers.join(', ')}`)
}

async function handleViewNumbers(interaction, db, userId) {
  const userData = db.users[userId]
  if (!userData || !userData.luckyNumbers || userData.luckyNumbers.length === 0) {
    return await interaction.reply({
      content: "❌ You haven't set any lucky numbers yet! Use `/lucky set` to choose your numbers.",
      ephemeral: true
    })
  }

  const luckyNumbers = userData.luckyNumbers
  const stats = calculateLuckyStats(userData)

  const embed = new EmbedBuilder()
    .setTitle('🍀 Your Lucky Numbers')
    .addFields(
      {
        name: '🎲 Current Numbers',
        value: luckyNumbers.map(n => `**${n}**`).join(', '),
        inline: false
      },
      {
        name: '📊 Statistics',
        value: `Bonus Entries Earned: **${stats.bonusEntries}**\nLucky Hits: **${stats.luckyHits}**`,
        inline: false
      }
    )
    .setColor(CONFIG.DEFAULT_THEME.accent)
    .setFooter({ text: 'Use /lucky set to change your numbers' })

  await interaction.reply({ embeds: [embed], ephemeral: true })
}

async function handleInfo(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🍀 Lucky Numbers System')
    .setDescription('Choose up to 3 lucky numbers (1-100) to earn bonus entries!')
    .addFields(
      {
        name: '🎯 How It Works',
        value: '• Set 1-3 lucky numbers between 1-100\n• When draws are conducted, random numbers are generated\n• If your lucky numbers match, you get bonus entries!',
        inline: false
      },
      {
        name: '🎁 Bonus Rewards',
        value: '• 1 match = +2 bonus entries\n• 2 matches = +5 bonus entries\n• 3 matches = +10 bonus entries',
        inline: false
      },
      {
        name: '⚡ Tips',
        value: '• Choose numbers that are meaningful to you\n• You can change your numbers anytime\n• Lucky bonuses apply to all eligible draws',
        inline: false
      }
    )
    .setColor(CONFIG.DEFAULT_THEME.info)
    .setFooter({ text: 'Use /lucky set to choose your lucky numbers!' })

  await interaction.reply({ embeds: [embed], ephemeral: true })
}

function calculateLuckyStats(userData) {
  // This would be calculated from draw history in a real implementation
  // For now, return placeholder values
  return {
    bonusEntries: userData.luckyBonusEntries || 0,
    luckyHits: userData.luckyHits || 0
  }
}

// Function to check lucky numbers during draws (to be called from draw system)
export function checkLuckyNumbers(db, userId, drawnNumbers) {
  const userData = db.users[userId]
  if (!userData || !userData.luckyNumbers || userData.luckyNumbers.length === 0) {
    return 0
  }

  const matches = userData.luckyNumbers.filter(num => drawnNumbers.includes(num))
  let bonusEntries = 0

  switch (matches.length) {
    case 1:
      bonusEntries = 2
      break
    case 2:
      bonusEntries = 5
      break
    case 3:
      bonusEntries = 10
      break
  }

  if (bonusEntries > 0) {
    // Track lucky stats
    if (!userData.luckyBonusEntries) userData.luckyBonusEntries = 0
    if (!userData.luckyHits) userData.luckyHits = 0
    
    userData.luckyBonusEntries += bonusEntries
    userData.luckyHits++
    
    logger.info(`User ${userId} got ${bonusEntries} bonus entries from ${matches.length} lucky number matches`)
  }

  return bonusEntries
}