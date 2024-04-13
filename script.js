if (!location.hash) {
    location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1);

// TODO: 用自己的频道 ID 替换
const drone = new ScaleDrone('yiS12Ts5RdNhebyM');
// 房间名需要以 'observable-' 为前缀
const roomName = 'observable-' + roomHash;
const configuration = {
    iceServers: [{
        urls: 'stun:stun.l.google.com:19302'
    }]
};
let room;
let pc;






function onSuccess() {};
function onError(error) {
    console.error(error);
};
function startTimer(time) {
    timer = setInterval(function() {
        if(time <= 0) {
            clearInterval(timer);
            alert('时间到');
        } else {
            time--;
            document.getElementById('timer').textContent = time;
        }
    }, 1000);
}
drone.on('open', error => {
    if (error) {
        return console.error(error);
    }
    room = drone.subscribe(roomName);
    room.on('open', error => {
        if (error) {
            onError(error);
        }
    });
    // 我们已经连接到房间并收到了一个 'members' 数组
    // 连接到房间（包括我们自己）。信令服务器已准备就绪。
    room.on('members', members => {
        console.log('MEMBERS', members);
        // 如果我们是第二个连接到房间的用户，我们将创建 offer
        const isOfferer = members.length === 2;
        startWebRTC(isOfferer);
    });

    room.on('data', (message, client) => {
    // 消息是我们发送的
    if (client.id === drone.clientId) {
        return;
    }

    if (message.startTimer) {
        // 设置计时的总时间
        let time = parseInt(message.totalTime);
        if (isNaN(time)) {
            console.error('Invalid totalTime:', message.totalTime);
            return;
        }
        // 开始计时
        startTimer(time);
    }
    });
});

// 通过 Scaledrone 发送信令数据
function sendMessage(message) {
    drone.publish({
        room: roomName,
        message
    });
}

function startWebRTC(isOfferer) {
    pc = new RTCPeerConnection(configuration);

    // 'onicecandidate' 通知我们每当 ICE 代理需要通过信令服务器向其他对等端传递消息时
    pc.onicecandidate = event => {
        if (event.candidate) {
            sendMessage({'candidate': event.candidate});
        }
    };

    let ws;
    // 如果用户是 offerer，则让 'negotiationneeded' 事件创建 offer
    if (isOfferer) {
        pc.onnegotiationneeded = () => {
            pc.createOffer().then(localDescCreated).catch(onError);
            // 创建一个 WebSocket 连接到服务器
            //ws = new WebSocket('ws://localhost:8080/path');
        }
    }
    else
    {
        //ws = new WebSocket('ws://localhost:8081/path');
    }


    // 当远程流到达时，在 #remoteVideo 元素中显示它
    pc.ontrack = event => {
        const stream = event.streams[0];
        if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
            remoteVideo.srcObject = stream;
        }
    };

    navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
    }).then(stream => {
        // 在 #localVideo 元素中显示本地视频
        localVideo.srcObject = stream;
        // 将您的流添加到要发送到连接对等端的流中
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }, onError);

    // 从 Scaledrone 监听信令数据
    room.on('data', (message, client) => {
        // 消息是我们发送的
        if (client.id === drone.clientId) {
            return;
        }

        if (message.sdp) {
            // 在从另一个对等端接收到 offer 或 answer 后调用此函数
            pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
                // 在接收到 offer 时回答它
                if (pc.remoteDescription.type === 'offer') {
                    pc.createAnswer().then(localDescCreated).catch(onError);
                }
            }, onError);
        } else if (message.candidate) {
            // 将新的 ICE candidate 添加到我们的连接的远程描述中
            pc.addIceCandidate(
                new RTCIceCandidate(message.candidate), onSuccess, onError
            );
        }
    });
}

// 当本地描述创建时，将其设置为本地描述并将其发送到远程对等端
function localDescCreated(desc) {
    pc.setLocalDescription(
        desc,
        () => sendMessage({'sdp': pc.localDescription}),
        onError
    );
}

  function showPopup(winner) {
  var popup = document.getElementById('popup');
  var winnerText = document.getElementById('winnerText');
  winnerText.textContent = winner + '胜出！';
  popup.style.display = 'block';

  // 设置1秒后关闭popup box
  setTimeout(function() {
    popup.style.display = 'none';
  }, 1000); // 1000毫秒后执行，即1秒后
}

// Set the popup to show after 5 seconds
setTimeout(function() {
  // Replace this with your actual condition
  if (true) {
    showPopup('我方');
  } else{
    showPopup('对方');
  }
}, 10000);


let timer = null;
let time = 0;
document.getElementById('startButton').addEventListener('click', function() {
    // 获取用户输入的时间
    time = document.getElementById('inputTime').value;
    // 开始计时
    startTimer(time);
    // 通知对方开始计时
    drone.publish({
        room: roomName,
        message: {startTimer: true, totalTime: time}
    });
});

