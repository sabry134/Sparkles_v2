const rows = `achievement|Grant or revoke a Sparkles achievement
add-points|Add tournament points to a participant
add-premium|Grant premium access to a user or server
add-role|Add a role to a server member
alert|Publish a highlighted staff alert in a selected channel
anti-alt|Configure minimum account age protection
anti-bot|View or configure automatic bot blocking
anti-link|Configure automatic link filtering
anti-raid|View or configure automatic raid protection
anti-spam|Configure automatic spam and flood protection
anti-swear|Configure automatic blocked-term filtering
automod-test|Test text against the current automod configuration
ask|Chat with the server AI using one complete prompt
auto-role|Configure the role automatically given to new members
auto-status|View all automated protection settings
automod|View or configure warning-based automoderation
avatar|Display a member's full-size avatar
backup|Download this server's complete Sparkles configuration
ban|Ban a member from the server
beg|Request a small random coin reward
blacklist|Block a user from protected server features
bot-info|Display information and statistics about Sparkles
browse|Open the frequently asked questions browser
claim|Redeem a premium claim code
clear|Delete a validated number of recent messages
clear-warnings|Clear all warnings from a member
purge-user|Delete recent messages from a selected member
purge-links|Delete recent messages containing links
purge-attachments|Delete recent messages containing attachments
purge-bots|Delete recent messages sent by bots
control-panel|Open the Sparkles control panel
create-category|Create a new server category
create-event|Create a new server event
create-text-channel|Create a new text channel
create-tournament|Create and configure a tournament
create-voice|Create a new voice channel
custom|Create, delete, or list server custom commands
daily|Claim your daily economy reward
debug|View restricted runtime diagnostics
define|Look up a word definition
delete-channel|Delete a selected server channel
delete-event|Delete an existing event
delete-role|Delete a selected server role
delete-tournament|Delete an existing tournament
deposit|Move coins from your wallet into the bank
disable-links|Disable automatic link filtering
embed|Publish a polished Components V2 message
enable-links|Enable automatic link filtering
files|List saved custom commands
filter-http|Filter links that use the HTTP protocol
filter-https|Filter links that use the HTTPS protocol
generate|Generate a premium claim code
generate-code|Generate a restricted Sparkles staff access code
giveaway|Start a giveaway in a selected channel
guess|Guess a number from one to ten
health|View your economy health status
help|Open the interactive command guide
info|Display detailed information about this server
invite|Create a Sparkles bot invite link
join-voice|Connect Sparkles to your voice channel
kick|Remove a member from the server
leaderboard|View the tournament points leaderboard
level|View your XP, level, and available perks
list|List current Sparkles events
logs|View, set, or disable the moderation log channel
lookup|Look up a Discord bot profile
lyrics|Search for song lyrics
memory|Generate a hidden sequence for a memory challenge
modify-role|Rename an existing server role
module|View or configure Sparkles command modules
now-playing|Display the currently playing track
open|Open one of your owned reward boxes
organize|Open the event organizer controls
pastebin|Create a private Pastebin from supplied content
ping|Check Sparkles response and gateway latency
play|Search for and play audio in your voice channel
prefix-only|Run a saved custom command by name
premium|View premium status and benefits
profile|View a member's Sparkles profile
purchase|Purchase reward boxes with wallet coins
queue|View the current music queue
quote|Quote an existing message by its Discord ID
random|Get a random fact, joke, quote, meme, dog, or cat
ratings|View a Tanki Online player's complete ratings
redeem-code|Redeem any valid Sparkles staff access code
remove-permissions|Remove your Sparkles staff permissions
remove-points|Remove tournament points from a participant
remove-premium|Remove premium access from a user or server
remove-role|Remove a role from a server member
rename|Change or randomize a member's nickname
reply|Reply to an existing Discord message
reset-suggestions|Disable and clear the suggestion channel
reward|Claim the reward for voting for Sparkles
rob|Attempt to steal coins from another member
rps|Play one round of rock paper scissors
rules|Display this server's configured rules
run-custom-command|Run one of your saved premium custom commands
say|Send an embed message to a selected channel
search|Search Sparkles frequently asked questions
set-currency|Set this server's economy currency
set-profile|Update a field on your Sparkles profile
set-suggestions|Set the channel used for suggestions
set-verification|Configure the verified-member role
setup|Create the standard Sparkles server layout
shop|Browse the economy store and prices
skip|Skip the current track
slowmode|Set slowmode for this or another text channel
soft-ban|Ban and immediately unban a user
song-search|Search the configured music service
start|Enable AI chat responses in this server
status|Inspect a user's Sparkles access status
stop|Disable AI chat responses in this server
sudo|Send a webhook-style message as a member
suggest|Submit a suggestion to the configured channel
tag|Create, view, list, edit, or delete server tags
thread|Create a public thread in the current channel
ticket|Open the restricted Sparkles management ticket
timeout|Timeout a member and privately notify them
translate|Detect and translate text with language controls
unban|Revoke a ban using a Discord user ID
unblacklist|Remove a user from the protected server blacklist
unwhitelist|Remove a user from automod exemptions
untimeout|Remove a member timeout and notify them
user-role|List a member's roles in the selected format
user-warnings|View the number of warnings for a member
verify|Post the interactive member verification panel
view|View your newest Sparkles notification
volume|Change music playback volume
warn|Warn, notify, log, and enforce policy for a member
weather|View current weather for a city or location
web-status|Check whether a public website is reachable
weekly|Claim your weekly economy reward
whitelist|Allow a user to bypass protected server filters
withdraw|Move banked coins into your wallet
lock|Lock a text channel so members cannot send messages
unlock|Unlock a previously locked text channel
user-info|Display detailed information about a server member
role-info|Display detailed information about a server role
server-icon|Display this server's full-size icon
poll|Create a reaction poll with two choices
announce|Publish an announcement embed in a channel
set-nickname|Set a server member's nickname
reset-nickname|Reset a server member's nickname
create-role|Create a new server role
channel-topic|Update a text channel's topic
reaction-role|Configure a role controlled by a message reaction
balance|Display a member's economy balance
coinflip|Flip a coin
dice|Roll a configurable die`;

export const catalog = rows.split('\n').map((row) => {
  const [name, description] = row.split('|');
  return { name, description };
});
