use clavis::{EncryptedStream, EncryptedStreamOptions, EncryptedPacket};
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;

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
    let host = args.get(1).map(|s| s.as_str()).unwrap_or("127.0.0.1");
    let port: u16 = args
        .get(2)
        .and_then(|s| s.parse().ok())
        .unwrap_or(9000);
    
    let psk = args.get(3).map(|s| s.as_bytes().to_vec());

    let address = format!("{}:{}", host, port);
    eprintln!("Connecting to {}...", address);

    let stream = TcpStream::connect(&address).await?;
    eprintln!("Connected successfully");

    let options = EncryptedStreamOptions {
        max_packet_size: 65536,
        psk: psk.map(|p| p.into()),
    };

    let encrypted = EncryptedStream::new(stream, Some(options)).await?;
    let (mut reader, mut writer) = encrypted.split();

    // Send a few test packets
    eprintln!("Sending Join packet...");
    writer
        .write_packet(&TestProtocol::Join("rust-client".to_string()))
        .await?;

    eprintln!("Sending Ping packet...");
    writer
        .write_packet(&TestProtocol::Ping(PingPongData {
            message: "hello from rust".to_string(),
        }))
        .await?;

    // Read response
    if reader.read_packet::<TestProtocol>().await.is_ok() {
        eprintln!("Received packet successfully");
    }

    eprintln!("Sending Shutdown packet...");
    writer.write_packet(&TestProtocol::Shutdown).await?;

    eprintln!("Test client completed successfully");
    Ok(())
}

