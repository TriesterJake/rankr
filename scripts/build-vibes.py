"""
Builds the small word-vector files the Compare screen uses to spot "similar vibe" items
(for example "eating" and "food"). You only need to run this if you want to rebuild them.

Input : GloVe 100d text vectors, most common words first (Wikipedia + Gigaword, public domain).
        Download the first 80,000 lines with:
          curl -sL https://github.com/RaRe-Technologies/gensim-data/releases/download/glove-wiki-gigaword-100/glove-wiki-gigaword-100.gz \
            | zcat | head -n 80001 > glove_top80k.txt
Output: public/vibes/words.txt    one word per line
        public/vibes/vectors.bin  int8 matrix, one 64-number row per word, in the same order
Needs : python3 and numpy
Usage : python3 scripts/build-vibes.py glove_top80k.txt
"""
import re
import sys

import numpy as np

VOCAB = 30000  # how many common words to keep
DIM = 64       # numbers per word after compression

src = sys.argv[1] if len(sys.argv) > 1 else "glove_top80k.txt"
words, rows = [], []
with open(src, encoding="utf8") as f:
    next(f)  # header line
    for line in f:
        parts = line.rstrip().split(" ")
        if re.fullmatch(r"[a-z]{2,}", parts[0]):
            words.append(parts[0])
            rows.append(np.array(parts[1:], dtype=np.float32))
        if len(words) >= VOCAB:
            break

X = np.stack(rows)
X = X - X.mean(axis=0)                                   # center
_, _, vt = np.linalg.svd(X, full_matrices=False)
X = X - (X @ vt[:1].T) @ vt[:1]                          # drop the dominant "common word" direction
_, _, vt = np.linalg.svd(X, full_matrices=False)
X = X @ vt[:DIM].T                                       # compress to DIM numbers per word
X = X / np.linalg.norm(X, axis=1, keepdims=True)         # unit length
q = np.round(X * 127).astype(np.int8)

with open("public/vibes/words.txt", "w", encoding="utf8") as f:
    f.write("\n".join(words))
q.tofile("public/vibes/vectors.bin")
print(f"{len(words)} words x {DIM} numbers -> {q.nbytes / 1e6:.2f} MB")
