import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { getDatabase } from '../utils/database.js'
import { logger } from '../utils/logger.js'
import { CONFIG, DEFAULT_THEME } from '../config.js'

export const data = new SlashCommandBuilder()
  .setName('milestones')
  .setDescription('View donation milestones and rewards')
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View your milestone progress')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all available milestones')
  )

export async function execute(interaction) {
  try {
    const serverId = interaction.guild.id
    const userId = interaction.user.id
    const db = getDatabase(serverId)

    // Check if milestone rewards are enabled
    if (!db.config?.featureToggles?.milestoneRewards) {
      return await interaction.reply({
        content: "❌ Milestone rewards are not enabled on this server.",
        ephemeral: true
      })
    }

    const subcommand = interaction.options.getSubcommand()

    switch (subcommand) {
      case 'view':
        await handleViewProgress(interaction, db, userId)
        break
      case 'list':
        await handleListMilestones(interaction, db)
        break
    }
  } catch (error) {
    logger.error('Error in milestones command:', error)
    await interaction.reply({
      content: "❌ An error occurred while processing your request.",
      ephemeral: true
    })
  }
}

async function handleViewProgress(interaction, db, userId) {
  const userData = db.users[userId]
  if (!userData) {
    return await interaction.reply({
      content: "❌ No donation data found. Make a donation first!",
      ephemeral: true
    })
  }

  const totalDonated = userData.totalDonated || 0
  const milestones = getMilestones()
  
  // Find current and next milestone
  let currentMilestone = null
  let nextMilestone = null
  
  for (const milestone of milestones) {
    if (totalDonated >= milestone.amount) {
      currentMilestone = milestone
    } else if (!nextMilestone) {
      nextMilestone = milestone
      break
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('🎯 Your Milestone Progress')
    .setDescription(`Total Donated: **$${totalDonated.toFixed(2)}**`)
    .setColor(DEFAULT_THEME.accent)

  if (currentMilestone) {
    embed.addFields({
      name: '🏆 Current Milestone',
      value: `**${currentMilestone.name}** - $${currentMilestone.amount}\n${currentMilestone.reward}`,
      inline: false
    })
  }

  if (nextMilestone) {
    const remaining = nextMilestone.amount - totalDonated
    const progress = (totalDonated / nextMilestone.amount) * 100
    const progressBar = createProgressBar(progress)
    
    embed.addFields({
      name: '🎯 Next Milestone',
      value: `**${nextMilestone.name}** - $${nextMilestone.amount}\n${nextMilestone.reward}\n\n${progressBar} ${progress.toFixed(1)}%\n$${remaining.toFixed(2)} remaining`,
      inline: false
    })
  } else {
    embed.addFields({
      name: '🌟 Congratulations!',
      value: 'You have reached all available milestones!',
      inline: false
    })
  }

  // Show completed milestones
  const completedMilestones = milestones.filter(m => totalDonated >= m.amount)
  if (completedMilestones.length > 0) {
    embed.addFields({
      name: '✅ Completed Milestones',
      value: completedMilestones.map(m => `• ${m.name} ($${m.amount})`).join('\n'),
      inline: false
    })
  }

  await interaction.reply({ embeds: [embed], ephemeral: true })
}

async function handleListMilestones(interaction, db) {
  const milestones = getMilestones()
  
  const embed = new EmbedBuilder()
    .setTitle('🎯 Donation Milestones')
    .setDescription('Complete these milestones to earn special rewards!')
    .setColor(DEFAULT_THEME.info)

  for (const milestone of milestones) {
    embed.addFields({
      name: `${milestone.icon} ${milestone.name} - $${milestone.amount}`,
      value: milestone.reward,
      inline: false
    })
  }

  embed.setFooter({ text: 'Use /milestones view to see your progress' })

  await interaction.reply({ embeds: [embed], ephemeral: true })
}

function getMilestones() {
  return [
    {
      name: 'First Steps',
      amount: 5,
      icon: '🌱',
      reward: '🎁 Welcome package + 2 bonus entries'
    },
    {
      name: 'Getting Started',
      amount: 25,
      icon: '🚀',
      reward: '🎁 5 bonus entries + Bronze Donor role'
    },
    {
      name: 'Committed Supporter',
      amount: 50,
      icon: '💪',
      reward: '🎁 10 bonus entries + Silver Donor role'
    },
    {
      name: 'Generous Donor',
      amount: 100,
      icon: '💰',
      reward: '🎁 20 bonus entries + Gold Donor role'
    },
    {
      name: 'Major Contributor',
      amount: 250,
      icon: '💎',
      reward: '🎁 50 bonus entries + Platinum Donor role'
    },
    {
      name: 'Diamond Supporter',
      amount: 500,
      icon: '💍',
      reward: '🎁 100 bonus entries + Diamond Donor role + VIP access'
    },
    {
      name: 'Elite Patron',
      amount: 1000,
      icon: '👑',
      reward: '🎁 200 bonus entries + Onyx Donor role + Exclusive perks'
    },
    {
      name: 'Legendary Benefactor',
      amount: 2500,
      icon: '🌟',
      reward: '🎁 500 bonus entries + Legendary status + Custom role'
    },
    {
      name: 'Ultimate Champion',
      amount: 5000,
      icon: '🏆',
      reward: '🎁 1000 bonus entries + Hall of Fame + Special recognition'
    }
  ]
}

function createProgressBar(percentage) {
  const filled = Math.round(percentage / 10)
  const empty = 10 - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}