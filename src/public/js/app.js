const socket = io();

// 브라우저에 그려지는 DOM노드에 접근하는 코드입니다.
const myFace = document.getElementById("myFace");
const muteBtn = document.getElementById("mute");
const cameraBtn = document.getElementById("camera");
const camerasSelect = document.getElementById("cameras");
const container = document.getElementById("container"); // 화상 Room 컨테이너
const call = document.getElementById("call");
const chat = document.getElementById("chat");
const messageForm = document.getElementById("messageForm");
const welcome = document.getElementById("welcome");
const enterRoomForm = document.getElementById("enterRoom");
const profile = document.getElementById("profile");
const saveNameForm = document.getElementById("saveName");

// 채팅과 화상기능 ui 노출 여부입니다. 소켓을 통해 방에 접속시 활성화 됩니다.
container.hidden = true;

// global 변수(상태)
let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let myPeerConnection;
let myDataChannel;
let myName = "익명(닉네임 세팅해주세요)";

// kakao로그인 이후 쿠키를 통해 사용자 데이터를 받아와 브라우저 쿠키에 저장하게 됩니다.
// 가져온 쿠키는 객체가 아닌 문자열 이기 때문에 다시 한번 파싱해 사용합니다.
let cookies = document.cookie.split("; ").reduce((prev, current) => {
  const [name, ...value] = current.split("=");
  prev[name] = value.join("=");
  return prev;
}, {});

// 파싱한 cookie에 name 속성을 유저 이름으로 설정합니다.
let kakaoName = decodeURIComponent(cookies.name);

if (cookies.name) {
  saveNameForm.querySelector(
    "h3"
  ).innerText = `카카오 로그인 완료 : ${kakaoName} 님`;
  myName = kakaoName;
  enterRoomForm.querySelector("span").innerText = `입장시 닉네임 : ${myName}`;
}
function kakao_login() {
  location.href = "http://localhost:3000/auth/kakao";
}

// ---------------------- 전역 세팅 끝 -------------------

// 자신의 브라우저에서 mediaDevices 객체를 통해 미디어 스트림들을 가져와 DOM노드에 연결합니다.
async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      if (currentCamera.label === camera.label) {
        option.selected = true;
      }
      camerasSelect.appendChild(option);
    });
  } catch (e) {
    console.log(e);
  }
}

// 가져온 스트림들 중 연결할 디바이스를 선택하고 돔에 연결
async function getMedia(deviceId) {
  // 카메라 설정 하기
  // deviceId없을 때
  const initialConstrains = {
    audio: true,
    video: { facingMode: "user" },
  };
  // deviceId있을 때
  const cameraConstraints = {
    audio: true,
    video: { deviceId: { exact: deviceId } },
  };
  try {
    myStream = await navigator.mediaDevices?.getUserMedia(
      deviceId ? cameraConstraints : initialConstrains
    );
    myFace.srcObject = myStream;
    if (!deviceId) {
      await getCameras();
    }
  } catch (e) {
    console.log(e);
  }
}

// 마이크 활성/비활성화
function handleMuteClick() {
  myStream
    .getAudioTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (!muted) {
    muteBtn.innerText = "Unmute";
    muted = true;
  } else {
    muteBtn.innerText = "Mute";
    muted = false;
  }
}

// 카메라 on/off
function handleCameraClick() {
  myStream
    .getVideoTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (cameraOff) {
    cameraBtn.innerText = "Turn Camera Off";
    cameraOff = false;
  } else {
    cameraBtn.innerText = "Turn Camera On";
    cameraOff = true;
  }
}

// 카메라 변경 함수
async function handleCameraChange() {
  await getMedia(camerasSelect.value);
  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(videoTrack);
  }
}

// DOM노드에 이벤트 등록
muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
camerasSelect.addEventListener("input", handleCameraChange);

// chatting
function sendMessage(event) {
  const input = messageForm.querySelector("input");
  event.preventDefault();
  console.log("send MSG");
  socket.emit("send_message", input.value, roomName, myName, (msg) => {
    addMessage(msg);
  });
  input.value = "";
}
// 메시지 수신 이벤트
socket.on("res_message", (msg, writer) => {
  addMessage(`${writer} : ${msg}`);
});
messageForm.addEventListener("submit", sendMessage);

// myName 설정 (회원 가입시 더많은 정보를 받아야하지만 이름만 받았습니다.)
async function handleSaveName(event) {
  event.preventDefault();
  const input = saveNameForm.querySelector("input");
  socket.emit("save_name", input.value, (msg) => {
    console.log("BE says : ", msg);
  });
  myName = input.value;
  saveNameForm.querySelector("h3").innerHTML = `NickName : ${myName}`;
  enterRoomForm.querySelector("span").innerHTML = `입장시 닉네임 : ${myName}`;
  input.value = "";
  console.log("handleSaveName", myName);
}
saveNameForm.addEventListener("submit", handleSaveName);

// Welcome Form (join a room)
async function initCall() {
  welcome.hidden = true;
  profile.hidden = true;
  container.hidden = false;
  const myNameDom = document.getElementById("myName");
  myNameDom.innerText = myName;
  await getMedia();
  makeConnection();
}

// 방제목 입력후 입장시 발동
async function handleWelcomeSubmit(event) {
  event.preventDefault();
  const input = enterRoomForm.querySelector("input");
  await initCall();
  socket.emit("join_room", input.value, myName);
  roomName = input.value;
  document.getElementById("Room").innerText = `Room Name : ${roomName}`;
  input.value = "";
}

enterRoomForm.addEventListener("submit", handleWelcomeSubmit);

// Socket Code

// 메시지 화면 렌더링
function addMessage(msg) {
  const ul = chat.querySelector("ul");
  const li = document.createElement("li");
  li.innerText = msg;
  ul.appendChild(li);
}

// 다른 유저 입장시
socket.on("welcome", async (name, enterId) => {
  addMessage(`${name}님이 입장하셨습니다.`);
  document.getElementById("yourName").innerText = name;
  myDataChannel = myPeerConnection.createDataChannel("chat");
  myDataChannel.addEventListener("message", (event) => console.log(event.data));
  console.log("made data channel");
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  console.log("sent the offer");
  socket.emit("offer", offer, roomName);
  socket.emit("change_name", enterId, myName);
});

// 이름 변경
socket.on("change_name", (name) => {
  document.getElementById("yourName").innerText = name;
});

// 방 입장 -> Offer 생성(peer A)  -> 서버로 Offer 전송 -> offer받고 remoteDescription등록(peer B)
// -> 미디어 스트림 추가하고 Answer생성후 LocalDescription등록(peer B)
// -> Answer 서버를 통해 다시 peer A에 전송 -> remoteDescription등록(peer A)
// 위의 과정을 아래의 소켓 코드들을 통해 서버에 자신의 정보를 넘기고 다른 유저의 정보를 받아 시그널링 합니다.

// offer 동작
socket.on("offer", async (offer) => {
  console.log("received the offer");
  myPeerConnection.setRemoteDescription(offer);
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  socket.emit("answer", answer, roomName);
  console.log("sent the answer");
});

// answer 동작
socket.on("answer", (answer) => {
  console.log("received the answer");
  myPeerConnection.setRemoteDescription(answer);
});

// browser끼리 통신을 위한 준비
socket.on("ice", (ice) => {
  console.log("received candidate");
  myPeerConnection.addIceCandidate(ice);
});

// 연결 종료
socket.on("bye", () => {
  addMessage("someone left ㅜㅜ");
});

// RTC Code

// stun 서버
function makeConnection() {
  // 연결을 위한 내정보를 생성
  myPeerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  });
  myPeerConnection.addEventListener("icecandidate", handleIce);
  myPeerConnection.addEventListener("addstream", handleAddStream);

  myStream
    .getTracks()
    .forEach((track) => myPeerConnection.addTrack(track, myStream));
}

// ice 요청
function handleIce(data) {
  console.log("sent candidate");
  socket.emit("ice", data.candidate, roomName);
}

// 상대방 연결 렌더링
function handleAddStream(data) {
  const peerFace = document.getElementById("peerFace");
  peerFace.srcObject = data.stream;
}
