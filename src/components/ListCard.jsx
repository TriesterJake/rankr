import { useState } from 'react'
import { Link } from 'react-router-dom'
import { topItems } from '../api.js'
import { inkOn } from '../templates.js'
import { imageUrl } from '../images.js'
import { Lightbox } from './ui.jsx'
import LikeButton, { Heart } from './LikeButton.jsx'
import FavoriteButton, { Star } from './FavoriteButton.jsx'

// A list summary card: icon top-left, rank top-right, title, item count and the current top 3.
// likeUserId: when set (a friend's list) the card shows Like and Favorite buttons.
// favorite: { ownerName, other: {id,title}|null, onChange(listId, on) } for the Favorite button.
export default function ListCard({ list, footer, rank, likeUserId, favorite }) {
  const likes = list.list_likes ?? []
  const favorites = list.list_favorites ?? []
  const [zoomed, setZoomed] = useState(false)
  const count = list.list_items?.length ?? 0
  const top = topItems(list, 3)
  const isFavorite = Boolean(likeUserId) && favorites.some((f) => f.user_id === likeUserId)
  return (
    <div className="list-card" style={{ '--list-color': list.color, '--list-ink': inkOn(list.color) }}>
      <Link to={`/list/${list.id}`} className="list-card-link">
        {list.icon_path ? (
          <div
            className="list-card-icon zoomable"
            role="button"
            tabIndex={0}
            aria-label={`View the picture for ${list.title}`}
            onClick={(e) => {
              // open the picture instead of opening the list
              e.preventDefault()
              e.stopPropagation()
              setZoomed(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                setZoomed(true)
              }
            }}
          >
            <img src={imageUrl(list.icon_path)} alt="" loading="lazy" />
          </div>
        ) : (
          <div className="list-card-icon">{list.icon || list.title.charAt(0).toUpperCase()}</div>
        )}
        {rank != null && (
          <span className={`rank list-card-rank rank-${rank <= 3 ? rank : 'n'}`} aria-label={`Rank ${rank}`}>
            {rank}
          </span>
        )}
        <div className={rank != null ? 'list-card-body has-rank' : 'list-card-body'}>
          <div className="list-card-title">
            <h3>{list.title}</h3>
            {list.visibility === 'private' && <span className="pill">Private</span>}
            {isFavorite && (
              <span className="pill fav-pill">
                <Star filled /> Your favorite
              </span>
            )}
          </div>
          <p className="muted small">
            {count === 0 ? 'Empty' : `${count} ${count === 1 ? 'item' : 'items'}`}
            {!likeUserId && likes.length > 0 && (
              <span className="like-count">
                <Heart filled /> {likes.length}
              </span>
            )}
            {!likeUserId && favorites.length > 0 && (
              <span className="like-count fav-count">
                <Star filled /> {favorites.length}
              </span>
            )}
          </p>
          {top.length > 0 && (
            <ol className="mini-top">
              {top.map((item, i) => (
                <li key={item.id}>
                  <b>{i + 1}</b>
                  <span>{item.title}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Link>
      {zoomed && <Lightbox src={imageUrl(list.icon_path)} caption={list.title} onClose={() => setZoomed(false)} />}
      {likeUserId && (
        <div className="card-like">
          <LikeButton
            listId={list.id}
            userId={likeUserId}
            initialLiked={likes.some((l) => l.user_id === likeUserId)}
            initialCount={likes.length}
          />
          {favorite && (
            <FavoriteButton
              list={list}
              ownerName={favorite.ownerName}
              isFavorite={isFavorite}
              other={favorite.other}
              onChange={(on) => favorite.onChange(list.id, on)}
            />
          )}
        </div>
      )}
      {footer}
    </div>
  )
}