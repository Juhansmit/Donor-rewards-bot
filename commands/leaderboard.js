import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js"
import { getDatabase } from "../utils/database.js"
import { logger } from "../utils/logger.js"

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("View donation leaderboards")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("donations")
      .setDescription("Top donors by total amount")
      .addIntegerOption((option) =>
        option.setName("limit").setDescription("Number of users to show (default: 10)").setRequired(false).setMinValue(1).setMaxValue(25),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("entries")
      .setDescription("Top users by total entries")
      .addIntegerOption((option) =>
        option.setName("limit").setDescription("Number of users to show (default: 10)").setRequired(false).setMinValue(1).setMaxValue(25),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("wins")
      .setDescription("Top winners")
      .addIntegerOption((option) =>
        option.setName("limit").setDescription("Number of users to show (default: 10)").setRequired(false).setMinValue(1).setMaxValue(25),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("streaks")
      .setDescription("Top donation streaks")
      .addIntegerOption((option) =>
        option.setName("limit").setDescription("Number of users to show (default: 10)").setRequired(false).setMinValue(1).setMaxValue(25),
      ),
  )

export async function execute(interaction) {
  try {
    const serverId = interaction.guildId
    const db = getDatabase(serverId)
    const subcommand = interaction.options.getSubcommand()
    const limit = interaction.options.getInteger("limit") || 10

    logger.info(`Leaderboard command executed: ${subcommand} by ${interaction.user.tag}`)

    switch (subcommand) {
      case "donations":
        await handleDonationsLeaderboard(interaction, db, limit)
        break
      case "entries":
        await handleEntriesLeaderboard(interaction, db, limit)
        break
      case "wins":
        await handleWinsLeaderboard(interaction, db, limit)
        break
      case "streaks":
        await handleStreaksLeaderboard(interaction, db, limit)
        break
      default:
        await interaction.reply({
          content: "❌ Unknown subcommand.",
          flags: MessageFlags.Ephemeral,
        })
    }
  } catch (error) {
    logger.error("Error in leaderboard command:", error)
    await interaction.reply({
      content: "❌ An error occurred while generating the leaderboard.",
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function handleDonationsLeaderboard(interaction, db, limit) {
  if (!db.users || Object.keys(db.users).length === 0) {
    return interaction.reply({
      content: "❌ No donation data available yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  // Get all users with donations and sort by total donated
  const userEntries = Object.entries(db.users)
    .filter(([_, user]) => user.totalDonated > 0)
    .map(([userId, user]) => ({
      userId,
      totalDonated: user.totalDonated,
      donationCount: user.donations?.length || 0,
      privacyEnabled: user.privacyEnabled || false,
    }))
    .sort((a, b) => b.totalDonated - a.totalDonated)
    .slice(0, limit)

  if (userEntries.length === 0) {
    return interaction.reply({
      content: "❌ No donations found.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("🏆 Top Donors")
    .setDescription(`Top ${userEntries.length} donors by total amount donated`)
    .setColor(db.config?.theme?.primary || "#4CAF50")

  let leaderboardText = ""
  const medals = ["🥇", "🥈", "🥉"]

  for (let i = 0; i < userEntries.length; i++) {
    const entry = userEntries[i]
    const medal = i < 3 ? medals[i] : `${i + 1}.`
    
    let username = "Anonymous User"
    if (!entry.privacyEnabled) {
      try {
        const user = await interaction.client.users.fetch(entry.userId)
        username = user.username
      } catch (error) {
        username = "Unknown User"
      }
    }

    leaderboardText += `${medal} **${username}** - $${entry.totalDonated.toFixed(2)} (${entry.donationCount} donations)\n`
  }

  embed.addFields({
    name: "💰 Donation Leaders",
    value: leaderboardText,
    inline: false,
  })

  // Add summary stats
  const totalDonated = userEntries.reduce((sum, entry) => sum + entry.totalDonated, 0)
  const totalDonations = userEntries.reduce((sum, entry) => sum + entry.donationCount, 0)

  embed.addFields({
    name: "📊 Summary",
    value: `Total Donated: $${totalDonated.toFixed(2)}\nTotal Donations: ${totalDonations}`,
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  embed.setTimestamp()

  await interaction.reply({ embeds: [embed] })
}

async function handleEntriesLeaderboard(interaction, db, limit) {
  if (!db.users || Object.keys(db.users).length === 0) {
    return interaction.reply({
      content: "❌ No entry data available yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  // Get all users with entries and sort by total entries
  const userEntries = Object.entries(db.users)
    .filter(([_, user]) => user.entries && Object.keys(user.entries).length > 0)
    .map(([userId, user]) => {
      const totalEntries = Object.values(user.entries).reduce((sum, count) => sum + count, 0)
      return {
        userId,
        totalEntries,
        totalDonated: user.totalDonated || 0,
        privacyEnabled: user.privacyEnabled || false,
      }
    })
    .filter(entry => entry.totalEntries > 0)
    .sort((a, b) => b.totalEntries - a.totalEntries)
    .slice(0, limit)

  if (userEntries.length === 0) {
    return interaction.reply({
      content: "❌ No entries found.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("🎟️ Top Entry Holders")
    .setDescription(`Top ${userEntries.length} users by total draw entries`)
    .setColor(db.config?.theme?.info || "#00BCD4")

  let leaderboardText = ""
  const medals = ["🥇", "🥈", "🥉"]

  for (let i = 0; i < userEntries.length; i++) {
    const entry = userEntries[i]
    const medal = i < 3 ? medals[i] : `${i + 1}.`
    
    let username = "Anonymous User"
    if (!entry.privacyEnabled) {
      try {
        const user = await interaction.client.users.fetch(entry.userId)
        username = user.username
      } catch (error) {
        username = "Unknown User"
      }
    }

    leaderboardText += `${medal} **${username}** - ${entry.totalEntries} entries ($${entry.totalDonated.toFixed(2)})\n`
  }

  embed.addFields({
    name: "🎟️ Entry Leaders",
    value: leaderboardText,
    inline: false,
  })

  // Add summary stats
  const totalEntries = userEntries.reduce((sum, entry) => sum + entry.totalEntries, 0)

  embed.addFields({
    name: "📊 Summary",
    value: `Total Entries: ${totalEntries}`,
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  embed.setTimestamp()

  await interaction.reply({ embeds: [embed] })
}

async function handleWinsLeaderboard(interaction, db, limit) {
  if (!db.users || Object.keys(db.users).length === 0) {
    return interaction.reply({
      content: "❌ No win data available yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  // Get all users with wins and sort by win count
  const userEntries = Object.entries(db.users)
    .filter(([_, user]) => (user.wins || 0) > 0)
    .map(([userId, user]) => ({
      userId,
      wins: user.wins || 0,
      totalDonated: user.totalDonated || 0,
      privacyEnabled: user.privacyEnabled || false,
    }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, limit)

  if (userEntries.length === 0) {
    return interaction.reply({
      content: "❌ No wins recorded yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("🏆 Top Winners")
    .setDescription(`Top ${userEntries.length} users by draw wins`)
    .setColor(db.config?.theme?.warning || "#FFC107")

  let leaderboardText = ""
  const medals = ["🥇", "🥈", "🥉"]

  for (let i = 0; i < userEntries.length; i++) {
    const entry = userEntries[i]
    const medal = i < 3 ? medals[i] : `${i + 1}.`
    
    let username = "Anonymous User"
    if (!entry.privacyEnabled) {
      try {
        const user = await interaction.client.users.fetch(entry.userId)
        username = user.username
      } catch (error) {
        username = "Unknown User"
      }
    }

    leaderboardText += `${medal} **${username}** - ${entry.wins} wins ($${entry.totalDonated.toFixed(2)})\n`
  }

  embed.addFields({
    name: "🏆 Win Leaders",
    value: leaderboardText,
    inline: false,
  })

  // Add summary stats
  const totalWins = userEntries.reduce((sum, entry) => sum + entry.wins, 0)

  embed.addFields({
    name: "📊 Summary",
    value: `Total Wins: ${totalWins}`,
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  embed.setTimestamp()

  await interaction.reply({ embeds: [embed] })
}

async function handleStreaksLeaderboard(interaction, db, limit) {
  if (!db.config?.featureToggles?.donationStreaks) {
    return interaction.reply({
      content: "❌ Donation streaks feature is not enabled.",
      flags: MessageFlags.Ephemeral,
    })
  }

  if (!db.users || Object.keys(db.users).length === 0) {
    return interaction.reply({
      content: "❌ No streak data available yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  // Get all users with streaks and sort by longest streak
  const userEntries = Object.entries(db.users)
    .filter(([_, user]) => (user.longestStreak || 0) > 0)
    .map(([userId, user]) => ({
      userId,
      currentStreak: user.donationStreak || 0,
      longestStreak: user.longestStreak || 0,
      totalDonated: user.totalDonated || 0,
      privacyEnabled: user.privacyEnabled || false,
    }))
    .sort((a, b) => b.longestStreak - a.longestStreak)
    .slice(0, limit)

  if (userEntries.length === 0) {
    return interaction.reply({
      content: "❌ No streaks recorded yet.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const embed = new EmbedBuilder()
    .setTitle("🔥 Top Streaks")
    .setDescription(`Top ${userEntries.length} users by longest donation streak`)
    .setColor(db.config?.theme?.error || "#F44336")

  let leaderboardText = ""
  const medals = ["🥇", "🥈", "🥉"]

  for (let i = 0; i < userEntries.length; i++) {
    const entry = userEntries[i]
    const medal = i < 3 ? medals[i] : `${i + 1}.`
    
    let username = "Anonymous User"
    if (!entry.privacyEnabled) {
      try {
        const user = await interaction.client.users.fetch(entry.userId)
        username = user.username
      } catch (error) {
        username = "Unknown User"
      }
    }

    leaderboardText += `${medal} **${username}** - ${entry.longestStreak} days (current: ${entry.currentStreak})\n`
  }

  embed.addFields({
    name: "🔥 Streak Leaders",
    value: leaderboardText,
    inline: false,
  })

  embed.setFooter({ text: "Powered By Aegisum Eco System" })
  embed.setTimestamp()

  await interaction.reply({ embeds: [embed] })
}