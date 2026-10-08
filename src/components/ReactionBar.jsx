import { useState } from 'react'

export const EMOJIS = ['🔥', '❤️', '😂', '👏', '🤔', '👎']

// Emoji reactions under one list item. Friends tap a chip (or + to pick) to react; the owner taps a chip to see who.
// reactions: [{ user_id, emoji }] for THIS item.
export default function ReactionBar({ reactions, userId, isOwner, onReact, onWho }) {
  const [picking, setPicking] = useState(false)
  const groups = []
  for (const r of reactions) {
    const g = groups.find((x) => x.emoji === r.emoji)
    if (g) g.count += 1
    else groups.push({ emoji: r.emoji, count: 1 })
    if (r.user_id === userId) groups.find((x) => x.emoji === r.emoji).mine = true
  }
  const mineEmoji = reactions.find((r) => r.user_id === userId)?.emoji

  if (isOwner && groups.length === 0) return null

  return (
    <div className="row-reactions">
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          className={g.mine ? 'reaction-chip mine' : 'reaction-chip'}
          onClick={() => (isOwner ? onWho() : onReact(g.emoji))}
          aria-label={`${g.emoji} ${g.count}`}
        >
          <span>{g.emoji}</span>
          <span>{g.count}</span>
        </button>
      ))}
      {!isOwner && (
        <button type="button" className="reaction-add" onClick={() => setPicking((p) => !p)} aria-label="Add a reaction" aria-expanded={picking}>
          {picking ? '×' : '☺ +'}
        </button>
      )}
      {isOwner && groups.length > 0 && (
        <button type="button" className="reaction-who" onClick={onWho}>
          Who?
        </button>
      )}
      {picking && !isOwner && (
        <div className="reaction-picker">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={e === mineEmoji ? 'mine' : ''}
              onClick={() => {
                setPicking(false)
                onReact(e)
              }}
              aria-label={`React ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}