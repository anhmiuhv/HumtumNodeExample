const {
  remote
} = require('electron');
const axios = require('axios');
const authService = remote.require('./services/auth-service');
const authProcess = remote.require('./main/auth-process');
const envVariables = remote.require('./env-variables');

const humtum = remote.require("./services/humtum")
let profileHumtum = null

const webContents = remote.getCurrentWebContents();
window.jQuery = window.$ = require('jquery');

function approveFriendRequest(senderid, button) {
  humtum.approveFriendRequest(envVariables.appId, senderid, (e) => {
    button.html("Error!")
    button.prop("disabled", true)
  }).then(v => {
    button.html("Approved")
    button.prop("disabled", true)
    refreshFriends()
  })
}

function rejectFriendRequest(senderid, button) {
  humtum.rejectFriendRequest(envVariables.appId, senderid, (e) => {
    button.html("Error!")
    button.prop("disabled", true)
  }).then(v => {
    button.html("Rejected")
    button.prop("disabled", true)
  })
}

function refreshFriendRequests() {
  humtum.getFollowerRequests(envVariables.appId).then(data => {
    listerner = []
    let txt = ""
    txt += "<table id=\"notitable\" class=\"table\"><tbody></tbody>"
    data && data.sent && data.sent.forEach(element => {
      txt += `<tr><td>${element.receiver.name}</td><td>${element.status}</td></tr>`;
    });
    data && data.received && data.received.forEach(element => {
      txt += `<tr><td>${element.sender.name}</td><td>
      <button class="btn btn-primary" id="friendrequestreceivedbutton${element.id}">Approve</button>
      <button class="btn btn-primary" id="friendrequestreceivedbutton${element.id}reject">Reject</button></td>
      </tr>`;
      listerner.push(() => {
        $(`#friendrequestreceivedbutton${element.id}`).click(function () {
          approveFriendRequest(element.sender.id, $(this))
        })
        $(`#friendrequestreceivedbutton${element.id}reject`).click(function () {
          rejectFriendRequest(element.sender.id, $(this))
        })
      })
    });
    txt += "</table>"
    $("#notifications").html(txt)
    listerner.forEach(v => v())
  })
}

function refreshFollowers() {
  humtum.getFollowers(envVariables.appId).then(data => {
    let txt = ""
    let listerner = []
    txt += "<table class=\"table\">"

    data && data.forEach(element => {
      txt += `<tr><td>${element.name}</td>
      <td></td>
      </tr>`;

    })

    txt += "</table>"
    $("#followers").html(txt)
    listerner.forEach(v => v())
  })
}

function refreshFollowing() {
  humtum.getFollowing(envVariables.appId).then(data => {
    let txt = ""
    let listerner = []
    txt += "<table class=\"table\">"

    data && data.forEach(element => {
      txt += `<tr><td>${element.name}</td>
      <td></td>
      </tr>`;

      // listerner.push(() => {
      //   $(`#friendMessage${element.id}`).click(() => {
      //     if (profileHumtum)
      //       humtum.createMessage({
      //         description: "message",
      //         app_id: envVariables.appId,
      //         payload: "poke",
      //         targets: [element.id]
      //       })

      //   })
      // })
    })

    txt += "</table>"
    $("#following").html(txt)
    listerner.forEach(v => v())
  })
}



webContents.on('dom-ready', () => {
  const profile = authService.getProfile();
  document.getElementById('picture').src = profile.picture;
  document.getElementById('name').innerText = profile.name;
  document.getElementById('logout').onclick = async () => {
    await authProcess.createLogoutWindow();
    remote.getCurrentWindow().close();
  };

  humtum.getSelf().then(data => {
    let txt = ""
    txt += "<table class=\"table\">"
    for (x in data) {
      txt += `<tr><td>${x}</td><td>${data[x]}</td></tr>`;
    }
    txt += "</table>"
    $("#profile").html(txt)
    profileHumtum = data
  })

  refreshFollowers()
  refreshFollowing()
  refreshFriendRequests()

   document.getElementById("friendsbtn").onclick = () => {
    $("#searchstate").html("Searching")
    humtum.searchUsersInApp(envVariables.appId, document.getElementById("friendid").value).then(data => {
      let txt = ""
      listender = []
      console.log(data)

      data && data.forEach(element => {
        txt += `<tr><td>${element.name}</td>
             <td><button class="btn btn-primary" id="follow${element.id}">Follow</button></td></tr>`;

        listerner.push(() => {
          $(`#follow${element.id}`).click(() => {
            humtum.followOther(envVariables.appId, element.id).then(
              v => {
                $(`#follow${element.id}`).html("Sent")
              }
            )
          })
        })
      })
      $("#userresult").html(txt)
      $("#searchstate").html("")
      listerner.forEach(v => v())
    })
  }

  document.getElementById("broadcastbtn").onclick = () => {
    humtum.getFollowers(envVariables.appId).then(data => {
      alls = []
      data && data.forEach(element => {
        alls.push(element.id)
      })
      humtum.createMessage({
        description: "message",
        app_id: envVariables.appId,
        payload: JSON.stringify({
          website: $("#webid").val(),
          websitemsg: $("#webmessage").val()
        }),
        targets: alls
      }).then(v => {
        $("#broadcaststate").html("Sent")
        setTimeout(() => {
          $("#broadcaststate").html("")
        }, 3000);
      })
      $("#broadcaststate").html("Sending")

    })

  }

  humtum.getMessage({
    unread: true
  }).then(data => {
    data && data.forEach(d => {
      $('#notitable tr:last').after(`<tr><td>${d["sender"]["id"]}</td><td>${d.payload}</td></tr>`);
      humtum.receiveMessage(d.id)
    })
  })

  humtum.subscribeToChannel(
    "MessagesChannel",
    () => {
      console.log("Connected to Message channer")
    },
    () => {

    },
    (data) => {
      data = JSON.parse(data)
      $('#notitable > tbody:last-child').append(`<tr><td>${data["sender_id"]}</td><td>${data["payload"]}</td></tr>`);
      humtum.receiveMessage(data["id"])
    }

  )
});
