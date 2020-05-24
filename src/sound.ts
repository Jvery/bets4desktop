module.exports = {
    preload,
    play
}

var path_ = require('path')

var VOLUME = 0.3

/* Cache of Audio elements, for instant playback */
var cache = {}

var sounds = {
    NOTIFICATION: {
        url: 'file://' + path_.join(__dirname, 'sound', 'notification.mp3'),
        volume: VOLUME
    }
}

function preload() {
    for (var name in sounds) {
        if (!cache[name]) {
            var sound = sounds[name]
            var audio = cache[name] = new window.Audio()
            audio.volume = sound.volume
            audio.src = sound.url
        }
    }
}

function play(name: any) {
    var audio = cache[name]
    if (!audio) {
        var sound = sounds[name]
        if (!sound) {
            throw new Error('Invalid sound name')
        }
        audio = cache[name] = new window.Audio()
        audio.volume = sound.volume
        audio.src = sound.url
    }
    audio.currentTime = 0
    audio.play()
}
