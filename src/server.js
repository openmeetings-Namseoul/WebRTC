import http from "http";
import SocketIO from "socket.io";
import express from "express";
import axios from "axios";
const cors = require("cors");
const qs = require("qs");
const app = express();

// 카카오에 등록한 내 애플리케이션 정보
const kakao = {
  clientID: "",
  clientSecret: "",
  redirectUri: "",
};
app.use(cors()); // cors 미들웨어
app.set("view engine", "pug"); // 뷰 엔진 연결 (pug사용)
app.set("views", __dirname + "/views"); //
app.use("/public", express.static(__dirname + "/public"));
app.get("/", (_, res) => res.render("home"));

let token;

// 내가 등록한 카카오톡 애플리케이션 키를 통해 로그인 url을 생성해줍니다.
app.get("/auth/kakao", (req, res) => {
  const kakaoAuthURL = `https://kauth.kakao.com/oauth/authorize?client_id=${kakao.clientID}&redirect_uri=${kakao.redirectUri}&response_type=code`;
  res.redirect(kakaoAuthURL);
});

app.get("/auth/kakao/callback", async (req, res) => {
  //axios>>promise object
  try {
    //access토큰을 받기 위한 코드
    token = await axios({
      //token
      method: "POST",
      url: "https://kauth.kakao.com/oauth/token",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      data: qs.stringify({
        grant_type: "authorization_code", //특정 스트링
        client_id: kakao.clientID,
        client_secret: kakao.clientSecret,
        redirectUri: kakao.redirectUri,
        code: req.query.code, //결과값을 반환했다. 안됐다.
      }), //객체를 string 으로 변환
    }).then((res) => {
      return res.data; // access token
    });
  } catch (err) {
    console.log("실패 >> ", err);
  }
  //access토큰을 받아서 사용자 정보를 알기 위해 쓰는 코드
  let user;
  try {
    //access정보를 가지고 또 요청해야 정보를 가져올 수 있음.
    // 자세한 API 정보(https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#req-user-info)
    user = await axios({
      method: "get",
      url: "https://kapi.kakao.com/v2/user/me",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    })
      .then((res) => {
        return res.data; // 사용자 정보 가져옴
      })
      .catch((err) => {
        console.log(err);
      });
  } catch (e) {
    console.log("내정보 가져오기 실패");
    console.error(e);
    // res.json(e.data);
  }
  // 가져온 데이터 쿠키에 저장
  res.cookie("token", token.access_token);
  res.cookie("name", user.kakao_account.profile.nickname);
  res.redirect("http://localhost:3000"); // 메인페이지로
});

// http 서버와 webSocket 설정
const httpServer = http.createServer(app);
const wsServer = SocketIO(httpServer);

// to와 emit으로 클라이언트와 연결된 소켓을 통해 시그널링 및 부가적인 기능들 컨트롤
wsServer.on("connection", (socket) => {
  socket.on("send_message", (msg, roomName, writer, done) => {
    done(msg);
    socket.to(roomName).emit("res_message", msg, writer);
  });
  socket.on("save_name", (name) => {
    // DB가 있다면 회원 정보 저장 로직
    console.log("save_name : ", name);
  });
  socket.on("join_room", (roomName, enterName) => {
    socket.join(roomName);
    console.log("join_room ->", enterName, roomName);
    socket.to(roomName).emit("welcome", enterName, socket.id);
  });
  socket.on("change_name", (enterId, name) => {
    socket.to(enterId).emit("change_name", name);
  });
  socket.on("offer", (offer, roomName) => {
    socket.to(roomName).emit("offer", offer);
  });
  socket.on("answer", (answer, roomName) => {
    socket.to(roomName).emit("answer", answer);
  });
  socket.on("ice", (ice, roomName) => {
    socket.to(roomName).emit("ice", ice);
  });
  socket.on("disconnecting", () => {
    socket.rooms.forEach((room) => socket.to(room).emit("bye"));
  });
});

const handleListen = () => console.log(`Listening on http://localhost:3000`);
httpServer.listen(3000, handleListen);
