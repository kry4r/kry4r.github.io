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
let ws = null;
let offer = false;
let answer = false;
let offer_send = false;
let answer_send = false;

function captureFrame(video) {
    // 设置canvas尺寸与视频帧相同
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // 将当前视频帧绘制到canvas上
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 获取图像数据
    let imageData = canvas.toDataURL('image/png');

    return imageData;
}



function onSuccess() {};
function onError(error) {
    console.error(error);
};
function startTimer(time) {
    timer = setInterval(function() {
        if(time == 0) {
            clearInterval(timer);
            let alertstring = "时间到,";
            if(parseInt(document.getElementById("localCounter").textContent) > parseInt(document.getElementById("remoteCounter").textContent)) {
                alertstring += "我方胜出";
            } else if(parseInt(document.getElementById("localCounter").textContent) < parseInt(document.getElementById("remoteCounter").textContent)) {
                alertstring += "对方胜出";
            }
            else {
                alertstring += "平局";
            }
            alert(alertstring);
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
    room.on('data', (message,client) => {
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
    if(message.not_offer)
    {
        answer_send= true;
    }

    if (message.localCounter) {
            // 将数据转换为整数
            let intValue = parseInt(message.localCounter);
            console.log(intValue);

            // 设置remoteCounter的值
            document.getElementById('remoteCounter').textContent = intValue;
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

    // 如果用户是 offerer，则让 'negotiationneeded' 事件创建 offer
    if (isOfferer) {
        //判断是否已经连接上websocket服务器
        offer = true;
        pc.onnegotiationneeded = () => {
            pc.createOffer().then(localDescCreated).catch(onError);
            ws = new WebSocket('ws://localhost:8080/path');


            // 当从服务器接收到数据时，处理数据
            ws.onmessage = function(event) {
                let data = event.data;
                // 假设服务器发送的是一个整数值
                // 如果接收到的消息是 'start_receiving'，则设置 isReceiving 为 true
                if (data === 'start_receiving') {
                    isReceiving = true;
                    return;
                }

                // 只有在接收到 'start_receiving' 消息后，才开始处理数据
                if (isReceiving) {
                    // 假设服务器发送的是一个整数值
                    let intValue = parseInt(data);
                    console.log(intValue);
                    document.getElementById("localCounter").textContent = intValue;
                }
            };

        }

    }
    else
        {

            ws = new WebSocket('ws://localhost:8080/path');
            if(answer_send = true)
            {
                ws.send("start_counter");
                isReceiving = true;
            }
            while(answer_send = true)
            {
                setInterval(function () {
                let localCounterValue = document.getElementById('localCounter').textContent;
                drone.publish({ room: roomName,
                    message: {localCounter: localCounterValue},
                });
                }, 1000);
            }


            ws.onmessage = function(event) {
                let data = event.data;
                // 假设服务器发送的是一个整数值
                // 如果接收到的消息是 'start_receiving'，则设置 isReceiving 为 true


                // 只有在接收到 'start_receiving' 消息后，才开始处理数据
                if (isReceiving) {
                    // 假设服务器发送的是一个整数值
                    let intValue = parseInt(data);
                    console.log(intValue);
                    document.getElementById("localCounter").textContent = intValue;
                }
            };
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


let timer = null;
let time = 0;
let timerId = null;
document.getElementById('startButton').addEventListener('click', function() {
    // 获取用户输入的时间
    time = document.getElementById('inputTime').value;
    // 开始计时
    startTimer(time);
    // 通知对方开始计时
    drone.publish({
        room: roomName,
        message: {startTimer: true, totalTime: time,}
    });

    timerId = setInterval(function() {
        let localCounterValue = document.getElementById('localCounter').textContent;
        drone.publish({
            room: roomName,
            message: {localCounter: localCounterValue},
        });

        // 检查是否到达设定的时间
        if (time-- <= 0) {
            clearInterval(timerId);
            // 计时结束，发送 'end_receiving' 消息
            if(offer) {
                ws.send('end_receiving');
            }
        }
    }, 1000);

    if(offer)
    {
        ws.send("start_counter");
        drone.publish({
            room: roomName,
            message: {not_offer: true},
        });
    }
});

if(answer_send) {
    window.onload = function () {
        let timerId = setInterval(function () {
            let localCounterValue = document.getElementById('localCounter').textContent;
            drone.publish({
                room: roomName,
                message: {localCounter: localCounterValue},
            });
        }, 1000);


    };
}

