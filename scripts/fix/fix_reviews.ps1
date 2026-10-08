$content = Get-Content 'C:\Users\pablo.lozano.ext\Desktop\proyecto series-pelis\series-peliculas-app\public\js\bundle.js' -Raw

$oldSort = @'
reviews
                                .slice()
                                .sort((a, b) => {
                                    if (reviewsSort === "votes") return (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes);
                                    if (reviewsSort === "recent") return new Date(b.createdAt) - new Date(a.createdAt);
                                    return (b.upvotes - b.downvotes + (b.replies?.length || 0)) - (a.upvotes - a.downvotes + (a.replies?.length || 0));
                                })
'@

$newSort = @'
reviews
                                .slice()
                                .sort((a, b) => {
                                    const friendIds = new Set(friends.map(f => f.id));
                                    const aIsFriend = friendIds.has(a.userId);
                                    const bIsFriend = friendIds.has(b.userId);
                                    if (aIsFriend !== bIsFriend) return aIsFriend ? -1 : 1;
                                    if (reviewsSort === "votes") return (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes);
                                    if (reviewsSort === "recent") return new Date(b.createdAt) - new Date(a.createdAt);
                                    return (b.upvotes - b.downvotes + (b.replies?.length || 0)) - (a.upvotes - a.downvotes + (a.replies?.length || 0));
                                })
'@

$content = $content.Replace($oldSort, $newSort)

Set-Content 'C:\Users\pablo.lozano.ext\Desktop\proyecto series-pelis\series-peliculas-app\public\js\bundle.js' -Value $content -Encoding UTF8
Write-Host 'Done'