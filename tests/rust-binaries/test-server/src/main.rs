use clavis::{EncryptedStream, EncryptedStreamOptions, EncryptedPacket};
use serde::{Deserialize, Serialize};
use tokio::net::{TcpListener, TcpStream};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PingPongData {
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChatMessage {
    username: String,
    content: String,
    timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Status {
    users_online: u32,
    server_uptime: u64,
}

clavis::protocol! {
    enum TestProtocol {
        Heartbeat,
        Join(String),
        Leave(String),
        Message(ChatMessage),
        Status(Status),
        Ping(PingPongData),
        Pong(PingPongData),
        Shutdown,
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let port: u16 = args
        .get(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(9000);
    
    let psk = args.get(2).map(|s| s.as_bytes().to_vec());

    let listener = TcpListener::bind(format!("127.0.0.1:{}", port)).await?;
    eprintln!("Rust test server listening on 127.0.0.1:{}", port);

    while let Ok((stream, _addr)) = listener.accept().await {
        let psk_clone = psk.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_client(stream, psk_clone).await {
                eprintln!("Error handling client: {}", e);
            }
        });
    }

    Ok(())
}

async fn handle_client(
    stream: TcpStream,
    psk: Option<Vec<u8>>,
) -> Result<(), Box<dyn std::error::Error>> {
    let options = EncryptedStreamOptions {
        max_packet_size: 65536,
        psk: psk.map(|p| p.into()),
    };

    let encrypted = EncryptedStream::new(stream, Some(options)).await?;
    let (mut reader, mut writer) = encrypted.split();

    // Echo back packets until Shutdown
    loop {
        match reader.read_packet::<TestProtocol>().await {
            Ok(packet) => {
                match &packet {
                    TestProtocol::Shutdown => {
                        eprintln!("Received shutdown, closing connection");
                        break;
                    }
                    TestProtocol::Ping(data) => {
                        // Respond with Pong
                        let pong = TestProtocol::Pong(PingPongData {
                            message: format!("pong-{}", data.message),
                        });
                        writer.write_packet(&pong).await?;
                    }
                    _ => {
                        // Echo back other packets
                        writer.write_packet(&packet).await?;
                    }
                }
            }
            Err(e) => {
                eprintln!("Error reading packet: {}", e);
                break;
            }
        }
    }

    Ok(())
}

