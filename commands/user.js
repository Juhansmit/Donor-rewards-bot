import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js"
import { getDatabase, saveDatabase } from "../utils/database.js"
import { logger } from "../utils/logger.js"

export const data = new SlashCommandBuilder()
  .setName("user")
  .setDescription("User commands for managing your profile and entries")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("profile")
      .setDescription("View your donation profile")
      .addUserOption((option) =>
        option.setName("target").setDescription("User to view profile for").setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("entries").setDescription("Check your draw entries"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("select_draw")
      .setDescription("Select which draw your next donations should count towards")
      .addStringOption((option) =>
        option.setName("draw_id").setDescription("ID of the draw to select (use 'auto' for automatic)").setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("privacy").setDescription("Manage your privacy settings")
      .addStringOption((option) =>
        option.setName("setting").setDescription("Privacy setting to change")
          .setRequired(true)
          .addChoices(
            { name: "Enable Privacy", value: "enable" },
            { name: "Disable Privacy", value: "disable" },
            { name: "View Current Settings", value: "view" }
          ),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("donor_roles")
      .setDescription("View and manage your donor roles")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("achievements")
      .setDescription("View your achievements")
      .addUserOption((option) =>
        option.setName("target").setDescription("User to view achievements for").setRequired(false)
      )
  )

export async function execute(interaction) {
  try {
    const serverId = interaction.guildId
    const db = getDatabase(serverId)
    const subcommand = interaction.options.getSubcommand()

    logger.info(`User command executed: ${subcommand} by ${interaction.user.tag}`)

    switch (subcommand) {
      case "profile":
        await handleProfile(interaction, db)
        break
      case "entries":
        await handleEntries(interaction, db)
        break
      case "select_draw":
        await handleSelectDraw(interaction, db)
        break
      case "privacy":
        await handlePrivacy(interaction, db)
        break
      case "donor_roles":
        await handleDonorRoles(interaction, db)
        break
      case "achievements":
        await handleAchievements(interaction, db)
        break
      default:
        await interaction.reply({
          content: "❌ Unknown subcommand.",
          flags: MessageFlags.Ephemeral,
        })
    }
  } catch (error) {
    logger.error("Error in user command:", error)
    await interaction.reply({
      content: "❌ An error occurred while processing your request.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function handleProfile(interaction, db) {
  const targetUser = interaction.options.getUser("target") || interaction.user
  const userId = targetUser.id

  if (!db.users?.[userId]) {
    return interaction.reply({
      content: targetUser.id === interaction.user.id 
        ? "❌ You haven't made any donations yet." 
        : "❌ This user hasn't made any donations yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const user = db.users[userId]
  
  // Check privacy settings
  if (targetUser.id !== interaction.user.id && user.privacyEnabled) {
    return interaction.reply({
      content: "❌ This user has privacy enabled.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const totalEntries = Object.values(user.entries || {}).reduce((sum, count) => sum + count, 0)
  const donationCount = user.donations?.length || 0
  const selectedDraw = user.selectedDraw || "auto"

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${targetUser.username}'s Profile`)
    .setColor(db.config?.theme?.primary || "#4CAF50")
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: "💰 Total Donated", value: `$${user.totalDonated.toFixed(2)}`, inline: true },
      { name: "🎟️ Total Entries", value: totalEntries.toString(), inline: true },
      { name: "📈 Donations Made", value: donationCount.toString(), inline: true },
      { name: "🏆 Wins", value: (user.wins || 0).toString(), inline: true },
      { name: "🎯 Selected Draw", value: selectedDraw === "auto" ? "Automatic" : selectedDraw, inline: true },
      { name: "🔒 Privacy", value: user.privacyEnabled ? "Enabled" : "Disabled", inline: true },
    )

  if (user.donationStreak && db.config?.featureToggles?.donationStreaks) {
    embed.addFields(
      { name: "🔥 Current Streak", value: `${user.donationStreak} days`, inline: true },
      { name: "🏅 Longest Streak", value: `${user.longestStreak || 0} days`, inline: true },
    )
  }

  if (user.achievements?.length > 0) {
    const achievements = user.achievements.slice(0, 5).join(", ")
    embed.addFields({
      name: "🏆 Recent Achievements",
      value: achievements + (user.achievements.length > 5 ? "..." : ""),
      inline: false,
    })
  }

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  embed.setTimestamp()

  await interaction.reply({ embeds: [embed] })
}

async function handleEntries(interaction, db) {
  const userId = interaction.user.id

  if (!db.users?.[userId]?.entries) {
    return interaction.reply({
      content: "❌ You don't have any draw entries yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const userEntries = db.users[userId].entries
  const draws = db.donationDraws || {}

  const embed = new EmbedBuilder()
    .setTitle("🎟️ Your Draw Entries")
    .setColor(db.config?.theme?.info || "#00BCD4")
    .setDescription("Here are your entries for all active draws:")

  let totalEntries = 0
  const entryFields = []

  for (const [drawId, entries] of Object.entries(userEntries)) {
    if (entries > 0 && draws[drawId]) {
      const draw = draws[drawId]
      totalEntries += entries
      entryFields.push({
        name: `🎁 ${draw.name}`,
        value: `${entries} entries\nReward: ${draw.reward}\nStatus: ${draw.active ? "🟢 Active" : "🔴 Inactive"}`,
        inline: true,
      })
    }
  }

  if (entryFields.length === 0) {
    return interaction.reply({
      content: "❌ You don't have any entries in active draws.",
      flags: MessageFlags.Ephemeral,
    })
  }

  embed.addFields(entryFields)
  embed.addFields({
    name: "📊 Summary",
    value: `Total Entries: **${totalEntries}**\nSelected Draw: **${db.users[userId].selectedDraw || "Automatic"}**`,
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  embed.setTimestamp()

  await interaction.reply({ embeds: [embed] })
}

async function handleSelectDraw(interaction, db) {
  const drawId = interaction.options.getString("draw_id")
  const userId = interaction.user.id

  // Initialize user data if needed
  if (!db.users) db.users = {}
  if (!db.users[userId]) {
    db.users[userId] = {
      totalDonated: 0,
      entries: {},
      donations: [],
      achievements: [],
      privacyEnabled: false,
      wins: 0,
    }
  }

  if (drawId === "auto") {
    db.users[userId].selectedDraw = "auto"
    saveDatabase(interaction.guildId, db)

    return interaction.reply({
      content: "✅ Set to **automatic** draw selection. Your donations will be distributed to all eligible draws.",
      flags: MessageFlags.Ephemeral,
    })
  }

  // Check if draw exists and is active
  const draw = db.donationDraws?.[drawId]
  if (!draw) {
    const availableDraws = Object.entries(db.donationDraws || {})
      .filter(([_, d]) => d.active)
      .map(([id, d]) => `• \`${id}\` - ${d.name}`)
      .join("\n")

    return interaction.reply({
      content: `❌ Draw not found.\n\nAvailable draws:\n${availableDraws || "None"}`,
      flags: MessageFlags.Ephemeral,
    })
  }

  if (!draw.active) {
    return interaction.reply({
      content: "❌ This draw is not currently active.",
      flags: MessageFlags.Ephemeral,
    })
  }

  db.users[userId].selectedDraw = drawId
  saveDatabase(interaction.guildId, db)

  const embed = new EmbedBuilder()
    .setTitle("✅ Draw Selected")
    .setDescription(`Your future donations will count towards: **${draw.name}**`)
    .setColor(db.config?.theme?.success || "#4CAF50")
    .addFields(
      { name: "🎁 Draw", value: draw.name, inline: true },
      { name: "💰 Min Amount", value: `$${draw.minAmount}`, inline: true },
      { name: "🏆 Reward", value: draw.reward, inline: true },
    )
    .addFields({
      name: "💡 Note",
      value: "Use `/user select_draw draw_id:auto` to return to automatic selection.",
      inline: false,
    })
    .setFooter({ text: "Powered By Aegisum Eco System" })

  await interaction.reply({ embeds: [embed] })
}

async function handlePrivacy(interaction, db) {
  const setting = interaction.options.getString("setting")
  const userId = interaction.user.id

  // Initialize user data if needed
  if (!db.users) db.users = {}
  if (!db.users[userId]) {
    db.users[userId] = {
      totalDonated: 0,
      entries: {},
      donations: [],
      achievements: [],
      privacyEnabled: false,
      wins: 0,
    }
  }

  switch (setting) {
    case "enable":
      db.users[userId].privacyEnabled = true
      saveDatabase(interaction.guildId, db)
      await interaction.reply({
        content: "✅ Privacy enabled. Your profile is now private.",
        flags: MessageFlags.Ephemeral,
      })
      break

    case "disable":
      db.users[userId].privacyEnabled = false
      saveDatabase(interaction.guildId, db)
      await interaction.reply({
        content: "✅ Privacy disabled. Your profile is now public.",
        flags: MessageFlags.Ephemeral,
      })
      break

    case "view":
      const status = db.users[userId].privacyEnabled ? "Enabled" : "Disabled"
      await interaction.reply({
        content: `🔒 Privacy Status: **${status}**`,
        flags: MessageFlags.Ephemeral,
      })
      break
  }
}

// Handle donor roles command
async function handleDonorRoles(interaction, db) {
  const userId = interaction.user.id
  
  // Initialize user if needed
  if (!db.users[userId]) {
    db.users[userId] = {
      totalDonated: 0,
      entries: {},
      donations: [],
      achievements: [],
      privacyEnabled: false,
      wins: 0
    }
  }
  
  const userData = db.users[userId]
  const totalDonated = userData.totalDonated || 0
  
  // Get donor roles configuration
  const donorRoles = db.config?.donorRoles || []
  
  const embed = new EmbedBuilder()
    .setTitle('🏅 Donor Roles')
    .setDescription(`You have donated a total of **$${totalDonated.toFixed(2)}**`)
    .setColor('#FF9800')
  
  if (donorRoles.length === 0) {
    embed.addFields({
      name: 'No Donor Roles Configured',
      value: 'The server admin has not set up any donor roles yet.'
    })
  } else {
    // Current role
    let currentRole = null
    let nextRole = null
    
    for (const role of donorRoles.sort((a, b) => a.amount - b.amount)) {
      if (totalDonated >= role.amount) {
        currentRole = role
      } else if (!nextRole) {
        nextRole = role
        break
      }
    }
    
    if (currentRole) {
      embed.addFields({
        name: '🎖️ Current Role',
        value: `**${currentRole.name}** (Requires $${currentRole.amount})`
      })
    }
    
    if (nextRole) {
      const amountNeeded = nextRole.amount - totalDonated
      embed.addFields({
        name: '⬆️ Next Role',
        value: `**${nextRole.name}** (Requires $${nextRole.amount})\nNeeded: $${amountNeeded.toFixed(2)} more`
      })
    }
    
    // All roles
    const allRolesField = {
      name: '📋 All Donor Roles',
      value: donorRoles.map(role => {
        const emoji = totalDonated >= role.amount ? '✅' : '⬜'
        return `${emoji} **${role.name}** - $${role.amount}`
      }).join('\n')
    }
    
    embed.addFields(allRolesField)
  }
  
  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  })
}

// Handle achievements command
async function handleAchievements(interaction, db) {
  const target = interaction.options.getUser('target') || interaction.user
  const userId = target.id
  
  // Check if user exists in database
  if (!db.users[userId]) {
    return interaction.reply({
      content: `❌ ${target.id === interaction.user.id ? 'You have' : 'This user has'} no donation history yet.`,
      flags: MessageFlags.Ephemeral
    })
  }
  
  // Import achievements command functionality
  const { ACHIEVEMENTS } = await import('../config.js')
  const userData = db.users[userId]
  
  // Get earned achievements
  const earnedAchievements = userData.achievements || []
  
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${target.id === interaction.user.id ? 'Your' : `${target.username}'s`} Achievements`)
    .setDescription(`${earnedAchievements.length} of ${Object.keys(ACHIEVEMENTS).length} achievements earned`)
    .setColor('#FF9800')
  
  if (earnedAchievements.length === 0) {
    embed.addFields({
      name: 'No Achievements Yet',
      value: 'Make donations to earn achievements!'
    })
  } else {
    // Show earned achievements
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
  }
  
  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  })
}