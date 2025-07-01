import { Events } from "discord.js"
import { getDatabase, saveDatabase } from "../utils/database.js"
import { logger } from "../utils/logger.js"
import { getCryptoPrice } from "../utils/cryptoUtils.js"
import { CONFIG } from "../config.js"

export const name = Events.MessageCreate

export async function execute(message) {
  if (message.author.bot) {
    // Check for tip.cc donations
    if (message.author.id === CONFIG.TIP_BOT_ID) {
      await handleTipccDonation(message)
    }
  }
}

async function handleTipccDonation(message) {
  try {
    const serverId = message.guildId
    if (!serverId) return

    const db = getDatabase(serverId)

    // Parse tip.cc message - improved regex pattern
    // This pattern matches tip.cc messages with custom emojis and user mentions
    // Format: <emoji> <@user> sent <@recipient> **amount currency** (≈ $value).
    const tipRegex = /<[a:]*\w+:\d+>\s*<@!?(\d+)>\s*sent\s*<@!?(\d+)>\s*\*\*([0-9.,]+)\s*(\w+)\*\*/i
    const match = message.content.match(tipRegex)

    if (!match) {
      // Try alternative pattern for different tip.cc formats
      const altRegex = /\*\*(.+?)\*\*\s*(?:sent|tipped)\s*\*\*([0-9.,]+)\s*(\w+)\*\*\s*to\s*\*\*(.+?)\*\*/i
      const altMatch = message.content.match(altRegex)
      
      if (!altMatch) {
        logger.debug(`No tip match found in message: ${message.content}`)
        return
      }
      
      const [, sender, amount, currency, recipient] = altMatch
      await processTip(message, db, sender, amount, currency, recipient, serverId)
      return
    }

    const [, senderId, recipientId, amount, currency] = match
    
    // Get user objects from IDs
    let sender, recipient
    try {
      sender = await message.client.users.fetch(senderId)
      recipient = await message.client.users.fetch(recipientId)
    } catch (error) {
      logger.error("Error fetching users:", error)
      return
    }

    logger.debug(`Detected tip: ${sender.username} sent ${amount} ${currency} to ${recipient.username}`)
    await processTip(message, db, sender.username, amount, currency, recipient.username, serverId, senderId, recipientId)
  } catch (error) {
    logger.error("Error handling tip.cc donation:", error)
  }
}

async function processTip(message, db, sender, amount, currency, recipient, serverId, senderId = null, recipientId = null) {

    // Check if recipient is in allowed recipients
    if (!db.config?.allowedRecipients?.length) {
      logger.debug("No allowed recipients configured")
      return
    }

    const isAllowedRecipient = db.config.allowedRecipients.some((allowed) => {
      if (typeof allowed === 'string') {
        return recipient.toLowerCase().includes(allowed.toLowerCase())
      } else if (allowed.name) {
        return recipient.toLowerCase().includes(allowed.name.toLowerCase())
      }
      return false
    })

    if (!isAllowedRecipient) {
      logger.debug(`Recipient ${recipient} not in allowed list`)
      return
    }

    // Check if currency is accepted
    const acceptedCurrencies = db.config?.acceptedCryptocurrencies || CONFIG.DEFAULT_ACCEPTED_CRYPTOCURRENCIES
    if (!acceptedCurrencies.includes(currency.toUpperCase())) {
      logger.debug(`Currency ${currency} not in accepted list`)
      return
    }

    // Parse amount as float
    const parsedAmount = Number.parseFloat(amount)
    if (isNaN(parsedAmount)) {
      logger.debug(`Invalid amount: ${amount}`)
      return
    }

    // Get USD value using the improved crypto price utility
    const usdValue = await getCryptoPrice(currency, parsedAmount, message.content)
    if (!usdValue) {
      logger.debug(`Could not determine USD value for ${parsedAmount} ${currency}`)
      return
    }

    // Find sender in guild - improved user matching
    const guild = message.guild
    let senderMember = null
    let actualSenderId = senderId
    
    if (senderId) {
      // We already have the sender ID from the regex match
      try {
        senderMember = await guild.members.fetch(senderId)
      } catch (error) {
        logger.debug(`Could not fetch member with ID ${senderId}`)
      }
    } else {
      // Try to find by username (fallback for alternative regex)
      senderMember = guild.members.cache.find(member => 
        member.user.username === sender || 
        member.displayName === sender
      )
      
      // If not found, try partial match
      if (!senderMember) {
        senderMember = guild.members.cache.find(member => 
          member.user.username.toLowerCase().includes(sender.toLowerCase()) || 
          member.displayName.toLowerCase().includes(sender.toLowerCase())
        )
      }
      
      if (senderMember) {
        actualSenderId = senderMember.user.id
      }
    }

    if (!senderMember || !actualSenderId) {
      logger.debug(`Could not find member matching sender: ${sender}`)
      return
    }

    logger.debug(`Matched sender ${sender} to user ID ${actualSenderId}`)

    // Initialize user data if needed
    if (!db.users[actualSenderId]) {
      db.users[actualSenderId] = {
        totalDonated: 0,
        entries: {},
        donations: [],
        achievements: [],
        privacyEnabled: false,
        wins: 0,
        lastDonation: null,
        donationStreak: 0,
        longestStreak: 0,
      }
    }

    // Update donation streak if feature is enabled
    if (db.config?.featureToggles?.donationStreaks) {
      const now = Date.now()
      const lastDonation = db.users[actualSenderId].lastDonation
      
      if (lastDonation) {
        const oneDayMs = 24 * 60 * 60 * 1000
        const daysSinceLastDonation = Math.floor((now - lastDonation) / oneDayMs)
        
        if (daysSinceLastDonation <= 1) {
          // Maintain or increase streak
          db.users[actualSenderId].donationStreak++
          
          // Update longest streak if current streak is longer
          if (db.users[actualSenderId].donationStreak > db.users[actualSenderId].longestStreak) {
            db.users[actualSenderId].longestStreak = db.users[actualSenderId].donationStreak
          }
        } else if (daysSinceLastDonation > 1) {
          // Reset streak
          db.users[actualSenderId].donationStreak = 1
        }
      } else {
        // First donation
        db.users[actualSenderId].donationStreak = 1
        db.users[actualSenderId].longestStreak = 1
      }
      
      db.users[actualSenderId].lastDonation = now
    }

    // Add donation
    db.users[actualSenderId].totalDonated += usdValue
    db.users[actualSenderId].donations.push({
      amount: usdValue,
      currency,
      originalAmount: parsedAmount,
      timestamp: Date.now(),
      recipient,
      messageId: message.id,
      channelId: message.channel.id,
    })

    // Process entries for eligible draws
    let entriesAdded = 0
    const entriesByDraw = {}
    
    // Check user's selected draw preference
    const selectedDraw = db.users[actualSenderId].selectedDraw || "auto"
    
    // Get eligible draws based on user preference
    let eligibleDraws = []
    
    if (selectedDraw === "auto") {
      // Automatic mode - check all draws
      eligibleDraws = Object.entries(db.donationDraws)
    } else {
      // Specific draw selected - only check that draw
      const draw = db.donationDraws[selectedDraw]
      if (draw) {
        eligibleDraws = [[selectedDraw, draw]]
      }
    }
    
    for (const [drawId, draw] of eligibleDraws) {
      if (!draw.active) continue
      if (usdValue < draw.minAmount || (draw.maxAmount && usdValue > draw.maxAmount)) continue
      if (draw.manualEntriesOnly) continue

      // Check VIP requirement
      if (draw.vipOnly && db.config?.vipRoleId) {
        const hasVipRole = senderMember.roles.cache.has(db.config.vipRoleId)
        if (!hasVipRole) continue
      }

      // Check donor tier requirement
      if (draw.minDonorTier) {
        const userTier = getUserDonorTier(db.users[actualSenderId].totalDonated)
        if (!userTier || !isTierEligible(userTier, draw.minDonorTier)) continue
      }

      // Check blacklist
      if (draw.blacklist) {
        // Check user blacklist
        if (draw.blacklist.users && draw.blacklist.users.includes(actualSenderId)) continue
        
        // Check role blacklist
        if (draw.blacklist.roles && draw.blacklist.roles.length > 0) {
          const hasBlacklistedRole = draw.blacklist.roles.some(roleId => 
            senderMember.roles.cache.has(roleId)
          )
          if (hasBlacklistedRole) continue
        }
      }

      // Check global blacklist
      if (db.config?.globalBlacklist) {
        if (db.config.globalBlacklist.users && db.config.globalBlacklist.users.some(entry => entry.id === actualSenderId)) continue
      }

      // Calculate entries based on user preference
      let entries
      if (selectedDraw === "auto") {
        // Automatic mode - calculate based on minimum amount
        entries = Math.floor(usdValue / draw.minAmount)
      } else {
        // Specific draw mode - user gets to choose how many entries they want
        // For now, we'll use all available entries, but this could be enhanced
        // to allow users to specify entry count
        entries = Math.floor(usdValue / draw.minAmount)
      }
      
      if (entries <= 0) continue

      // Check if draw has space
      const currentEntries = Object.values(draw.entries || {}).reduce((sum, count) => sum + count, 0)
      if (currentEntries >= draw.maxEntries) continue

      // Add entries
      if (!draw.entries) draw.entries = {}
      if (!draw.entries[actualSenderId]) draw.entries[actualSenderId] = 0
      if (!db.users[actualSenderId].entries) db.users[actualSenderId].entries = {}
      if (!db.users[actualSenderId].entries[drawId]) db.users[actualSenderId].entries[drawId] = 0

      const entriesToAdd = Math.min(entries, draw.maxEntries - currentEntries)
      draw.entries[actualSenderId] += entriesToAdd
      db.users[actualSenderId].entries[drawId] += entriesToAdd
      entriesAdded += entriesToAdd
      entriesByDraw[drawId] = entriesToAdd
      
      // If user selected a specific draw, only process that one
      if (selectedDraw !== "auto") break
    }

    // Add entry to history
    if (entriesAdded > 0) {
      if (!db.entryHistory) db.entryHistory = []
      
      db.entryHistory.push({
        userId: actualSenderId,
        username: senderMember.user.username,
        amount: usdValue,
        currency,
        originalAmount: parsedAmount,
        entriesAdded,
        entriesByDraw,
        timestamp: Date.now(),
        messageId: message.id,
      })
    }

    // Update analytics
    if (!db.analytics) db.analytics = {}
    
    // Daily donations
    const today = new Date().toISOString().split('T')[0]
    if (!db.analytics.dailyDonations) db.analytics.dailyDonations = {}
    if (!db.analytics.dailyDonations[today]) db.analytics.dailyDonations[today] = 0
    db.analytics.dailyDonations[today] += usdValue
    
    // Total donations
    if (!db.analytics.totalDonations) db.analytics.totalDonations = 0
    db.analytics.totalDonations += usdValue
    
    // Donor count
    if (!db.analytics.donorCount) db.analytics.donorCount = 0
    if (db.users[actualSenderId].donations.length === 1) {
      db.analytics.donorCount++
    }
    
    // Average donation
    const totalDonations = Object.values(db.users).reduce((sum, user) => sum + user.donations.length, 0)
    const totalAmount = Object.values(db.users).reduce((sum, user) => sum + user.totalDonated, 0)
    db.analytics.averageDonation = totalAmount / (totalDonations || 1)
    db.analytics.lastUpdated = Date.now()

    // Check for achievements
    if (db.config?.featureToggles?.achievementSystem) {
      checkAndAwardAchievements(db, actualSenderId)
    }

    // Save database
    saveDatabase(serverId, db)

    // Send confirmation
    if (entriesAdded > 0) {
      // Get display name that respects privacy settings
      const displayName = getDisplayName(actualSenderId, senderMember.user.username, db)
      
      const confirmationMessage = `🎉 **${displayName}** donated **$${usdValue.toFixed(2)}** and received **${entriesAdded}** draw entries!\n\nUse \`/entries\` to see your entries.`

      await message.channel.send(confirmationMessage)
      
      // Send notification to notification channel if configured
      if (db.config?.notificationChannelId) {
        try {
          const notificationChannel = await message.guild.channels.fetch(db.config.notificationChannelId)
          if (notificationChannel) {
            await notificationChannel.send(`💰 New donation: **${displayName}** donated **$${usdValue.toFixed(2)}** and received **${entriesAdded}** entries.`)
          }
        } catch (error) {
          logger.error(`Error sending notification: ${error.message}`)
        }
      }
    }

    logger.info(`Processed donation: ${sender} -> $${usdValue.toFixed(2)} (${entriesAdded} entries)`)
  } catch (error) {
    logger.error("Error processing tip.cc donation:", error)
    logger.error(error.stack)
  }
}

// Helper function to get user's donor tier based on total donations
function getUserDonorTier(totalDonated) {
  const tiers = Object.entries(CONFIG.DONOR_ROLES)
    .sort((a, b) => b[1].minAmount - a[1].minAmount) // Sort by minAmount descending
  
  for (const [tierId, tierData] of tiers) {
    if (totalDonated >= tierData.minAmount) {
      return tierId
    }
  }
  
  return null
}

// Helper function to check if user's tier meets the minimum requirement
function isTierEligible(userTier, minTier) {
  const tiers = Object.keys(CONFIG.DONOR_ROLES)
  const userTierIndex = tiers.indexOf(userTier)
  const minTierIndex = tiers.indexOf(minTier)
  
  return userTierIndex >= 0 && minTierIndex >= 0 && userTierIndex <= minTierIndex
}

// Helper function to get display name that respects privacy settings
function getDisplayName(userId, username, db) {
  if (db.config?.featureToggles?.anonymousMode && db.users[userId]?.privacyEnabled) {
    return "🕶️ Anonymous"
  }
  return username
}

// Helper function to check and award achievements
function checkAndAwardAchievements(db, userId) {
  const userData = db.users[userId]
  if (!userData) return
  
  // Initialize achievements array if it doesn't exist
  if (!userData.achievements) userData.achievements = []
  
  // Import achievements from config
  const { ACHIEVEMENTS } = CONFIG
  
  // Check each achievement
  for (const [achievementId, achievement] of Object.entries(ACHIEVEMENTS)) {
    // Skip if already awarded
    if (userData.achievements.includes(achievementId)) continue
    
    // Check if user meets requirement
    if (achievement.requirement(userData)) {
      // Award achievement
      userData.achievements.push(achievementId)
      logger.info(`Awarded achievement ${achievement.name} to user ${userId}`)
    }
  }
}
