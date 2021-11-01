import { findFlagUrlByIso2Code } from 'country-flags-svg'
import { getCountry, getTimezone } from 'countries-and-timezones';



export default [
  {
    name: "ping",
    exec: (args, p) => p.peer.send("pong")
  },
  {
    name: "geo",
    exec: (args, peerData) => {
      let p = peerData.ipInfo;
      let svgLink = findFlagUrlByIso2Code(p.country);
      let countryName = getCountry(p.country).name;
      let timezone = getTimezone(p.timezone);
      let geoData = {
        loc: p.loc,
        country: countryName,
        iso2: p.country,
        tz: p.timezone,
        utcOffset: timezone.utcOffset,
        dstOffset: timezone.dstOffset,
        flag: svgLink
      }
      peerData.peer.send("geo " + JSON.stringify(geoData))
    }
  },
  {
    name: "geos",
    exec: (args, p, context) => {
      let players = context.map(peerData => {
        let p = peerData.ipInfo;
        let svgLink = findFlagUrlByIso2Code(p.country);
        let countryName = getCountry(p.country).name;
        let timezone = getTimezone(p.timezone);
        return {
          loc: p.loc,
          country: countryName,
          iso2: p.country,
          tz: p.timezone,
          utcOffset: timezone.utcOffset,
          dstOffset: timezone.dstOffset,
          flag: svgLink
        }
      })
      p.peer.send("geos " + JSON.stringify(players))
    }
  },
  {
    name: "lifeprotip",
    exec: (args, p) => {
      let facts = [
        "A person who has never made a mistake has never tried anything new.",
        "Banging your head against a wall for hours and hours is an extremely effective way to pass the time.",
        "The most common way people give up their power is by thinking they don’t have any.",
        "The best revenge is massive success.",
        "If you hear a voice within you say “you cannot paint,” then by all means paint and that voice will be silenced.",
        "The only person you are destined to become is the person you decide to be.",
        "A thrilling time is in your immediate future.",
        "The world is a dangerous place, and those who do not act will be swept up in their own destruction.",
        "It’s better to be alone sometimes.",
        "When everything seems to be going against you, remember that the airplane takes off against the wind, not with it.",
        "It’s not the years in your life that count. It’s the life in your years.",
        "Change your thoughts and you change your world.",
        "The best time to plant a tree was 20 years ago. The second best time is now.",
        "The person who will not stand for something will fall for anything.",
        "If you tell the truth, you don’t have to remember anything.",
        "A friend is someone who knows all about you and still loves you.",
        "A life spent making mistakes is not only more honorable, but more useful than a life spent doing nothing.",
        "If you want to make a permanent change, stop focusing on the negative and focus on the positive.",
        "The only way to do great work is to love what you do.",
        "If you can dream it, you can achieve it.",
        "The best time to plant a tree was 20 years ago. The second best time is now.",
        "The person who will not stand for something will fall for anything.",
        "If you tell the truth, you don’t have to remember anything.",
        "A friend is someone who knows all about you and still"
      ]
      p.peer.send(facts[Math.floor(Math.random() * facts.length)])
    }
  }
]