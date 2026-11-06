<template>
  <p>The same push-your-luck game, but meaner. Penalties go on other players, and action cards can hit players who have already stayed.</p>

  <h3>Each round</h3>
  <ol>
    <li>Everyone is dealt one card, starting left of the dealer.</li>
    <li>On your turn, <strong>flip</strong> another card or <strong>stay</strong>. Staying keeps your cards, but others can still play cards on you.</li>
    <li>Get a number you already have, from any source, and you <strong>bust</strong>, scoring nothing this round.</li>
    <li>Hold <strong>7 number cards</strong> to flip 7: the round ends at once and you get 15 bonus points.</li>
    <li>Otherwise the round ends when everyone has stayed or busted.</li>
  </ol>

  <h3>Special numbers</h3>
  <ul>
    <li><strong>The Zero:</strong> while you hold it, you score 0 unless you flip 7, and you can’t stay.</li>
    <li><strong>Unlucky 7:</strong> throws away all your other cards. It never busts you, but another 7 after it will.</li>
    <li><strong>Lucky 13:</strong> lets you hold two 13s. A third one busts you.</li>
  </ul>

  <h3>Penalty cards</h3>
  <p>When you flip a <strong>−2 to −10</strong> or <strong>÷2</strong>, give it to any player who hasn’t busted, including someone who stayed. You keep it only if nobody else is left.</p>
  <p>Scoring: add your numbers, halve for ÷2 (rounding down), then subtract penalties. Scores can’t go below 0. Add 15 for flipping 7.</p>

  <h3>Action cards</h3>
  <p>You must use an action card if there’s anyone it can be used on. If there isn’t, it’s thrown away.</p>
  <ul>
    <li><strong>Just One More:</strong> a player flips one more card, then has to stay.</li>
    <li><strong>Flip Four:</strong> a player flips the next four cards. Actions and penalties they flip are used afterwards, unless they bust or flip 7.</li>
    <li><strong>Steal:</strong> take any card from in front of another player. If it matches one of yours, you bust.</li>
    <li><strong>Swap:</strong> swap two cards belonging to different players. This can bust both of them.</li>
    <li><strong>Discard:</strong> throw away any one card from in front of a player.</li>
  </ul>
</template>
