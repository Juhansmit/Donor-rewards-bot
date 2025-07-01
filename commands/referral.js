import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { getDatabase, saveDatabase } from '../utils/database.js'
import { logger } from '../utils/logger.js'
import { CONFIG } from '../config.js'

export const data = new SlashCommandBuilder()
  .setName('referral')
  .setDescription('Manage referral system')
  .addSubcommand(subcommand =>
    subcommand
      .setName('code')
      .setDescription('Get your referral code')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('use')
      .setDescription('Use a referral code')
      .addStringOption(option =>
        option
          .setName('code')
          .setDescription('The referral code to use')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('View your referral statistics')
  )

export async function execute(interaction) {
  try {
    const serverId = interaction.guild.id
    const userId = interaction.user.id
    const db = getDatabase(serverId)

    // Check if referral system is enabled
    if (!db.config?.featureToggles?.referralSystem) {
      return await interaction.reply({
        content: "❌ Referral system is not enabled on this server.",
        ephemeral: true
      })
    }

    const subcommand = interaction.options.getSubcommand()

    switch (subcommand) {
      case 'code':
        await handleGetCode(interaction, db, userId, serverId)
        break
      case 'use':
        await handleUseCode(interaction, db, userId, serverId)
        break
      case 'stats':
        await handleStats(interaction, db, userId)
        break
    }
  } catch (error) {
    logger.error('Error in referral command:', error)
    await interaction.reply({
      content: "❌ An error occurred while processing your request.",
      ephemeral: true
    })
  }
}

async function handleGetCode(interaction, db, userId, serverId) {
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
      referrals: { referred: [], referredBy: null, bonusEntries: 0 }
    }
  }

  // Generate referral code if not exists
  if (!db.users[userId].referralCode) {
    db.users[userId].referralCode = generateReferralCode(userId)
    saveDatabase(serverId, db)
  }

  const embed = new EmbedBuilder()
    .setTitle('🔗 Your Referral Code')
    .setDescription(`Share this code with friends to earn referral bonuses!`)
    .addFields(
      { name: '📋 Referral Code', value: `\`${db.users[userId].referralCode}\``, inline: false },
      { name: '👥 People Referred', value: `${db.users[userId].referrals?.referred?.length || 0}`, inline: true },
      { name: '🎁 Bonus Entries Earned', value: `${db.users[userId].referrals?.bonusEntries || 0}`, inline: true }
    )
    .setColor(CONFIG.DEFAULT_THEME.primary)
    .setFooter({ text: 'Use /referral use <code> to use someone else\'s code' })

  await interaction.reply({ embeds: [embed], ephemeral: true })
}

async function handleUseCode(interaction, db, userId, serverId) {
  const code = interaction.options.getString('code')

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
      referrals: { referred: [], referredBy: null, bonusEntries: 0 }
    }
  }

  // Check if user already used a referral code
  if (db.users[userId].referrals?.referredBy) {
    return await interaction.reply({
      content: "❌ You have already used a referral code!",
      ephemeral: true
    })
  }

  // Find the referrer by code
  const referrerId = Object.keys(db.users).find(id => 
    db.users[id].referralCode === code
  )

  if (!referrerId) {
    return await interaction.reply({
      content: "❌ Invalid referral code!",
      ephemeral: true
    })
  }

  if (referrerId === userId) {
    return await interaction.reply({
      content: "❌ You cannot use your own referral code!",
      ephemeral: true
    })
  }

  // Apply referral
  db.users[userId].referrals.referredBy = referrerId
  
  // Initialize referrer's referrals if needed
  if (!db.users[referrerId].referrals) {
    db.users[referrerId].referrals = { referred: [], referredBy: null, bonusEntries: 0 }
  }
  
  db.users[referrerId].referrals.referred.push(userId)
  
  // Give bonus entries to referrer (5 entries per referral)
  const bonusEntries = 5
  db.users[referrerId].referrals.bonusEntries += bonusEntries

  saveDatabase(serverId, db)

  const referrerMember = await interaction.guild.members.fetch(referrerId)
  
  const embed = new EmbedBuilder()
    .setTitle('✅ Referral Code Used!')
    .setDescription(`You've successfully used **${referrerMember.user.username}**'s referral code!`)
    .addFields(
      { name: '🎁 Bonus for Referrer', value: `${bonusEntries} bonus entries`, inline: true },
      { name: '💡 Your Benefit', value: 'Future referral bonuses unlocked!', inline: true }
    )
    .setColor(CONFIG.DEFAULT_THEME.success)

  await interaction.reply({ embeds: [embed], ephemeral: true })

  // Notify referrer if they're online
  try {
    await referrerMember.send(`🎉 **${interaction.user.username}** used your referral code! You earned ${bonusEntries} bonus entries!`)
  } catch (error) {
    // User has DMs disabled, that's fine
  }

  logger.info(`User ${userId} used referral code from ${referrerId}`)
}

async function handleStats(interaction, db, userId) {
  if (!db.users[userId]?.referrals) {
    return await interaction.reply({
      content: "❌ No referral data found.",
      ephemeral: true
    })
  }

  const referrals = db.users[userId].referrals
  const referredCount = referrals.referred?.length || 0
  const bonusEntries = referrals.bonusEntries || 0
  
  let referredByText = 'None'
  if (referrals.referredBy) {
    try {
      const referrerMember = await interaction.guild.members.fetch(referrals.referredBy)
      referredByText = referrerMember.user.username
    } catch (error) {
      referredByText = 'Unknown User'
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('📊 Your Referral Statistics')
    .addFields(
      { name: '👥 People You Referred', value: `${referredCount}`, inline: true },
      { name: '🎁 Bonus Entries Earned', value: `${bonusEntries}`, inline: true },
      { name: '🔗 Referred By', value: referredByText, inline: true }
    )
    .setColor(CONFIG.DEFAULT_THEME.info)

  if (referredCount > 0) {
    // Show referred users (up to 10)
    const referredUsers = []
    for (let i = 0; i < Math.min(referredCount, 10); i++) {
      try {
        const member = await interaction.guild.members.fetch(referrals.referred[i])
        referredUsers.push(member.user.username)
      } catch (error) {
        referredUsers.push('Unknown User')
      }
    }
    
    embed.addFields({
      name: '📋 Referred Users',
      value: referredUsers.join('\n') + (referredCount > 10 ? `\n... and ${referredCount - 10} more` : ''),
      inline: false
    })
  }

  await interaction.reply({ embeds: [embed], ephemeral: true })
}

function generateReferralCode(userId) {
  // Generate a 6-character code based on user ID
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  const seed = parseInt(userId.slice(-8), 16) // Use last 8 chars of user ID as seed
  
  for (let i = 0; i < 6; i++) {
    result += chars.charAt((seed + i * 7) % chars.length)
  }
  
  return result
}