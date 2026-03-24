/**
 * Test fixture: 3 real note cards from xiaohongshu.com/explore
 * Captured 2026-03-23. Used for extractor and observer tests.
 */
export const EXPLORE_FEED_HTML = `<div id="exploreFeeds" class="feeds-container" style="width:auto;height:auto;visibility:hidden;" data-v-37bca28d><section class="note-item" style="--24ef2a2d:216px;--029464c0:16px;--46a402fb:blur(42.5px);" data-width="1440" data-height="1920" data-index="0" data-v-37bca28d data-v-0a8ea4b9><div data-v-0a8ea4b9><a style="display:none;" href="/explore/69c01db9000000001b021fe0" data-v-0a8ea4b9></a><!--[--><a class="cover mask" target="_self" style="height:392px;" href="/explore/69c01db9000000001b021fe0?xsec_token=ABMH_0yMr6lcgUvY5mX6os7gthTB00Hb6nHaH-TWzMqJc=&amp;xsec_source=" data-v-0a8ea4b9><img src="" data-xhs-img data-v-0a8ea4b9></a><!--]--><div class="footer" data-v-0a8ea4b9><a target="_self" class="title" data-v-0a8ea4b9><span data-v-0a8ea4b9 data-v-51ec0135>三流Econ原来在证明天热了大家都会去游泳</span></a><div class="author-wrapper" data-v-0a8ea4b9><a href="/user/profile/62c32c8a000000001b02570e" class="author" target="_blank" data-v-0a8ea4b9><div class="avatar-container" data-v-0a8ea4b9 data-v-1f0bebac><img class="author-avatar" data-v-0a8ea4b9></div><span class="name" data-v-0a8ea4b9>元亨说</span></a><span class="like-wrapper like-active" data-v-0a8ea4b9 data-v-0bcf83ab><span class="count" data-v-0bcf83ab>665</span></span></div></div></div></section><section class="note-item" style="--24ef2a2d:216px;" data-width="1440" data-height="1920" data-index="1" data-v-37bca28d data-v-0a8ea4b9><div data-v-0a8ea4b9><a style="display:none;" href="/explore/69aa41600000000015038859" data-v-0a8ea4b9></a><a class="cover mask" target="_self" href="/explore/69aa41600000000015038859?xsec_token=ABVqTbe" data-v-0a8ea4b9><img src="" data-xhs-img data-v-0a8ea4b9><span class="play-icon" data-v-0a8ea4b9></span></a><div class="footer" data-v-0a8ea4b9><a target="_self" class="title" data-v-0a8ea4b9><span data-v-0a8ea4b9 data-v-51ec0135>重庆黄色法拉利果然名不虚传，只要你说一句赶时间，师傅马上让你知道什么是速度与激情</span></a><div class="author-wrapper" data-v-0a8ea4b9><a href="/user/profile/5fef094c000000000100930f" class="author" target="_blank" data-v-0a8ea4b9><div class="avatar-container" data-v-0a8ea4b9 data-v-1f0bebac><img class="author-avatar" data-v-0a8ea4b9></div><span class="name" data-v-0a8ea4b9>8D重庆</span></a><span class="like-wrapper like-active" data-v-0a8ea4b9 data-v-0bcf83ab><span class="count" data-v-0bcf83ab>3448</span></span></div></div></div></section><section class="note-item" style="--24ef2a2d:216px;" data-width="2048" data-height="2007" data-index="2" data-v-37bca28d data-v-0a8ea4b9><div data-v-0a8ea4b9><a style="display:none;" href="/explore/69bf735d00000000210123a5" data-v-0a8ea4b9></a><a class="cover mask" target="_self" href="/explore/69bf735d00000000210123a5?xsec_token=ABCrj9Ff" data-v-0a8ea4b9><img src="" data-xhs-img data-v-0a8ea4b9></a><div class="footer" data-v-0a8ea4b9><a target="_self" class="title" data-v-0a8ea4b9><span data-v-0a8ea4b9 data-v-51ec0135>Claude实体机展览</span></a><div class="author-wrapper" data-v-0a8ea4b9><a href="/user/profile/5f69703300000000010066b3" class="author" target="_blank" data-v-0a8ea4b9><div class="avatar-container" data-v-0a8ea4b9 data-v-1f0bebac><img class="author-avatar" data-v-0a8ea4b9></div><span class="name" data-v-0a8ea4b9>mi</span></a><span class="like-wrapper like-active" data-v-0a8ea4b9 data-v-0bcf83ab><span class="count" data-v-0bcf83ab>2561</span></span></div></div></div></section></div>`

/** Expected extraction results for the 3 fixture cards */
export const EXPECTED_NOTES = [
  {
    noteId: '69c01db9000000001b021fe0',
    title: '三流Econ原来在证明天热了大家都会去游泳',
    author: '元亨说',
    likeCount: '665',
  },
  {
    noteId: '69aa41600000000015038859',
    title: '重庆黄色法拉利果然名不虚传，只要你说一句赶时间，师傅马上让你知道什么是速度与激情',
    author: '8D重庆',
    likeCount: '3448',
  },
  {
    noteId: '69bf735d00000000210123a5',
    title: 'Claude实体机展览',
    author: 'mi',
    likeCount: '2561',
  },
]
