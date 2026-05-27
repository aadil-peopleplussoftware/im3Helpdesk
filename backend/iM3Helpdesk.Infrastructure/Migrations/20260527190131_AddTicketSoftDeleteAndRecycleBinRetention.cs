using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iM3Helpdesk.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTicketSoftDeleteAndRecycleBinRetention : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Tickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserId",
                table: "Tickets",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Tickets",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "RecycleBinRetentionUnit",
                table: "Organizations",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "RecycleBinRetentionValue",
                table: "Organizations",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_IsDeleted",
                table: "Tickets",
                column: "IsDeleted");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tickets_IsDeleted",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "RecycleBinRetentionUnit",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "RecycleBinRetentionValue",
                table: "Organizations");
        }
    }
}
