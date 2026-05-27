using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iM3Helpdesk.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTicketCommentEmailMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Bcc",
                table: "TicketComments",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Cc",
                table: "TicketComments",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InReplyTo",
                table: "TicketComments",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NotifiedTo",
                table: "TicketComments",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "References",
                table: "TicketComments",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Bcc",
                table: "TicketComments");

            migrationBuilder.DropColumn(
                name: "Cc",
                table: "TicketComments");

            migrationBuilder.DropColumn(
                name: "InReplyTo",
                table: "TicketComments");

            migrationBuilder.DropColumn(
                name: "NotifiedTo",
                table: "TicketComments");

            migrationBuilder.DropColumn(
                name: "References",
                table: "TicketComments");
        }
    }
}
