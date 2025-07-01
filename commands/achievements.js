import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { loadDatabase } from '../utils/database.js'
import { logger } from '../utils/logger.js'
import { CONFIG, ACHIEVEMENTS } from '../config.js'

export const data = new SlashCommandBuilder()
  .setName('achievements')
  .setDescription('View your achievements and progress')
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View your earned achievements')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all available achievements')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('progress')
      .setDescription('View your progress towards unearned achievements')
  )

export async function execute(interaction) {
  try {
    const serverId = interaction.guild.id
    const userId = interaction.user.id
    const db = loadDatabase(serverId)

    // Check if achievement system is enabled
    if (!db.config?.featureToggles?.achievementSystem) {
      return await interaction.reply({
        content: "❌ Achievement system is not enabled on this server.",
        ephemeral: true
      })
    }

    const subcommand = interaction.options.getSubcommand()

    switch (subcommand) {
      case 'view':
        await handleViewAchievements(interaction, db, userId)
        break
      case 'list':
        await handleListAchievements(interaction)
        break
      case 'progress':
        await handleProgress(interaction, db, userId)
        break
    }
  } catch (error) {
    logger.error('Error in achievements command:', error)
    await interaction.reply({
      content: "❌ An error occurred while processing your request.",
      ephemeral: true
    })
  }
}

async function handleViewAchievements(interaction, db, userId) {
  const userData = db.users[userId]
  if (!userData || !userData.achievements || userData.achievements.length === 0) {
    return await interaction.reply({
      content: "❌ You haven't earned any achievements yet! Start donating to unlock them.",
      ephemeral: true
    })
  }

  const earnedAchievements = userData.achievements
  const totalAchievements = Object.keys(ACHIEVEMENTS).length
  const completionPercentage = ((earnedAchievements.length / totalAchievements) * 100).toFixed(1)

  const embed = new EmbedBuilder()
    .setTitle('🏆 Your Achievements')
    .setDescription(`You've earned **${earnedAchievements.length}/${totalAchievements}** achievements (${completionPercentage}%)`)
    .setColor(CONFIG.DEFAULT_THEME.success)

  // Group achievements by category or show all
  for (const achievementId of earnedAchievements) {
    const achievement = ACHIEVEMENTS[achievementId]
    if (achievement) {
      embed.addFields({
        name: `${achievement.icon} ${achievement.name}`,
        value: achievement.description,
        inline: true
      })
    }
  }

  if (earnedAchievements.length === totalAchievements) {
    embed.setFooter({ text: '🌟 Congratulations! You have earned all achievements!' })
  } else {
    embed.setFooter({ text: 'Use /achievements progress to see what you can earn next!' })
  }

  await interaction.reply({ embeds: [embed], ephemeral: true })
}

async function handleListAchievements(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🏆 All Achievements')
    .setDescription('Complete these challenges to earn special recognition!')
    .setColor(CONFIG.DEFAULT_THEME.info)

  for (const [achievementId, achievement] of Object.entries(ACHIEVEMENTS)) {
    embed.addFields({
      name: `${achievement.icon} ${achievement.name}`,
      value: achievement.description,
      inline: true
    })
  }

  embed.setFooter({ text: 'Use /achievements view to see your earned achievements' })

  await interaction.reply({ embeds: [embed], ephemeral: true })
}

async function handleProgress(interaction, db, userId) {
  const userData = db.users[userId]
  if (!userData) {
    return await interaction.reply({
      content: "❌ No data found. Make a donation first to start earning achievements!",
      ephemeral: true
    })
  }

  const earnedAchievements = userData.achievements || []
  const unearned = Object.entries(ACHIEVEMENTS).filter(([id]) => !earnedAchievements.includes(id))

  if (unearned.length === 0) {
    return await interaction.reply({
      content: "🌟 Congratulations! You have earned all available achievements!",
      ephemeral: true
    })
  }

  const embed = new EmbedBuilder()
    .setTitle('📈 Achievement Progress')
    .setDescription('Here\'s what you can work towards next:')
    .setColor(CONFIG.DEFAULT_THEME.accent)

  for (const [achievementId, achievement] of unearned.slice(0, 10)) { // Show max 10
    const progress = getAchievementProgress(achievement, userData)
    embed.addFields({
      name: `${achievement.icon} ${achievement.name}`,
      value: `${achievement.description}\n${progress}`,
      inline: false
    })
  }

  if (unearned.length > 10) {
    embed.setFooter({ text: `... and ${unearned.length - 10} more achievements to unlock!` })
  }

  await interaction.reply({ embeds: [embed], ephemeral: true })
}

function getAchievementProgress(achievement, userData) {
  const totalDonated = userData.totalDonated || 0
  const wins = userData.wins || 0
  const longestStreak = userData.longestStreak || 0
  const referrals = userData.referrals?.referred?.length || 0

  switch (achievement.id) {
    case 'first_donation':
      return totalDonated > 0 ? '✅ Complete!' : '❌ Make your first donation'
    
    case 'generous_donor':
      if (totalDonated >= 100) return '✅ Complete!'
      return `💰 Progress: $${totalDonated.toFixed(2)} / $100.00`
    
    case 'big_spender':
      if (totalDonated >= 500) return '✅ Complete!'
      return `💎 Progress: $${totalDonated.toFixed(2)} / $500.00`
    
    case 'whale':
      if (totalDonated >= 1000) return '✅ Complete!'
      return `🐋 Progress: $${totalDonated.toFixed(2)} / $1,000.00`
    
    case 'lucky_winner':
      return wins > 0 ? '✅ Complete!' : '🍀 Win a donation draw'
    
    case 'streak_master':
      if (longestStreak >= 7) return '✅ Complete!'
      return `🔥 Progress: ${longestStreak} / 7 days`
    
    case 'community_pillar':
      if (referrals >= 3) return '✅ Complete!'
      return `🏛️ Progress: ${referrals} / 3 referrals`
    
    default:
      return '📊 Check requirements'
  }
}